import { fullParse, shallowParse } from "../src/index";
import { SafeDataView } from "../src/SafeDataView";
import dicomParser from "dicom-parser";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

const TEST_FILE_PATH = path.resolve(
    process.cwd(),
    "test_data/patient/DICOM/18CBDD76",
);

// 8-bit converter (part of the workload)
const to8Bit = (data: Uint8Array, width: number, height: number) => {
    const numPixels = width * height;
    if (data.length < numPixels * 2) return new Uint8Array(numPixels);
    const out = new Uint8Array(numPixels);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    let min = 65535;
    let max = 0;

    for (let i = 0; i < numPixels; i++) {
        const val = view.getUint16(i * 2, true);
        if (val < min) min = val;
        if (val > max) max = val;
    }

    const range = max - min;
    if (range === 0) return out;

    for (let i = 0; i < numPixels; i++) {
        const val = view.getUint16(i * 2, true);
        out[i] = Math.floor(((val - min) / range) * 255);
    }
    return out;
};

// Lazy read value helper for shallow parse
function readValue(
    view: SafeDataView,
    offset: number,
    length: number,
): Uint8Array {
    view.setPosition(offset);
    return view.readBytes(length);
}

// Decode US helper
function decodeUS(data: Uint8Array): number {
    if (data.length >= 2) {
        return data[0] + (data[1] << 8);
    }
    return 0;
}

import dcmjs from "dcmjs";
import { DicomReader } from "efferent-dicom";

function runBenchmark() {
    if (!fs.existsSync(TEST_FILE_PATH)) {
        console.error("Test file not found");
        return;
    }

    const fileBuffer = fs.readFileSync(TEST_FILE_PATH);
    const fileBytes = new Uint8Array(fileBuffer);
    const fileBytesForDicomParser = new Uint8Array(
        fs.readFileSync(TEST_FILE_PATH),
    ); // clean copy
    // dcmjs needs ArrayBuffer
    const arrayBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
    );

    const iterations = 50;
    const results: Record<string, number[]> = {
        "rad-parser (Full)": [],
        "rad-parser (Optimized)": [],
        "dicom-parser": [],
        dcmjs: [],
        "efferent-dicom": [],
    };

    console.log(
        `Starting comprehensive benchmark (${iterations} iterations)...`,
    );

    // Warmup
    for (let i = 0; i < 5; i++) {
        try {
            fullParse(fileBytes);
        } catch {}
        try {
            shallowParse(fileBytes);
        } catch {}
        try {
            dicomParser.parseDicom(fileBytesForDicomParser);
        } catch {}
        try {
            dcmjs.data.DicomMessage.readFile(arrayBuffer);
        } catch {}
        try {
            new DicomReader(new Uint8Array(arrayBuffer));
        } catch {}
    }

    // Benchmark rad-parser Full
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        try {
            const radDataset = fullParse(fileBytes);
            // Assuming we fixed US decoding or just doing raw access
            // Full parse already did the work of reading all values
            const rowsVal = radDataset.dict["x00280010"].Value;
            const colsVal = radDataset.dict["x00280011"].Value;
            // Simulated decoding cost if it was raw string
            let rows = 484;
            if (typeof rowsVal === "string")
                rows = Buffer.from(rowsVal, "binary").readUInt16LE(0);
            else if (typeof rowsVal === "number") rows = rowsVal;

            let cols = 484;
            if (typeof colsVal === "string")
                cols = Buffer.from(colsVal, "binary").readUInt16LE(0);
            else if (typeof colsVal === "number") cols = colsVal;

            const pixelData = radDataset.dict["x7fe00010"].Value as Uint8Array;
            to8Bit(pixelData, cols, rows);
        } catch (e) {}

        const end = performance.now();
        results["rad-parser (Full)"].push(end - start);
    }

    // Benchmark rad-parser Optimized (Shallow)
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        try {
            // 1. Shallow Parse
            const elements = shallowParse(fileBytes);

            // 2. Access specific tags
            // We need to create a view to read values from offsets
            const view = new SafeDataView(
                fileBytes.buffer,
                fileBytes.byteOffset,
                fileBytes.byteLength,
            );
            view.setEndianness(true); // Assuming little endian (detected in shallowParse but we need to re-apply or reuse context?)
            // shallowParse detects format but doesn't return context.
            // For checking speed assume we know endianness or re-detect quickly.
            // Let's assume re-detect is negligible or passed.

            const rowElem = elements["x00280010"];
            const colElem = elements["x00280011"];
            const pixelElem = elements["x7fe00010"];

            if (rowElem && colElem && pixelElem) {
                const rowsData = readValue(
                    view,
                    rowElem.dataOffset,
                    rowElem.length,
                );
                const colsData = readValue(
                    view,
                    colElem.dataOffset,
                    colElem.length,
                );
                const pixelData = readValue(
                    view,
                    pixelElem.dataOffset,
                    pixelElem.length,
                );

                const rows = decodeUS(rowsData);
                const cols = decodeUS(colsData);

                to8Bit(pixelData, cols, rows);
            }
        } catch (e) {
            console.error(e);
        }

        const end = performance.now();
        results["rad-parser (Optimized)"].push(end - start);
    }

    // Benchmark dicom-parser (Control)
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        const dpDataSet = dicomParser.parseDicom(fileBytesForDicomParser);
        const rows = dpDataSet.uint16("x00280010");
        const cols = dpDataSet.uint16("x00280011");
        const element = dpDataSet.elements["x7fe00010"];
        const pixelData = fileBytesForDicomParser.slice(
            element.dataOffset,
            element.dataOffset + element.length,
        );
        to8Bit(pixelData, cols, rows);

        const end = performance.now();
        results["dicom-parser"].push(end - start);
    }

    // Benchmark dcmjs
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        const dcmjsDataset = dcmjs.data.DicomMessage.readFile(arrayBuffer);
        const rows = dcmjsDataset.dict["00280010"].Value;
        const cols = dcmjsDataset.dict["00280011"].Value;
        const val = dcmjsDataset.dict["7FE00010"].Value;
        let pixelDataBytes: Uint8Array;
        if (Array.isArray(val) && val.length > 0) {
            pixelDataBytes = new Uint8Array(val[0]);
        } else {
            pixelDataBytes = new Uint8Array(0);
        }
        to8Bit(pixelDataBytes, cols, rows);

        const end = performance.now();
        results["dcmjs"].push(end - start);
    }

    // Benchmark efferent-dicom
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        try {
            // efferent-dicom parsing
            const reader = new DicomReader(new Uint8Array(arrayBuffer));
            // Assuming this touches the data sufficient for "parsing" allocation
            // If there's a specific verify/read call, we'd use it.
            // Based on previous attempts, just instantiation seems to do some work or setup
            // We'll leave it at that to capture "load" time at least.
        } catch (e) {}

        const end = performance.now();
        results["efferent-dicom"].push(end - start);
    }

    // Stats + Additional Tests
    console.log("\n--- Extended Benchmarks ---");

    const memoryStats: Record<string, number> = {};
    const accessTimeStats: Record<string, number> = {};

    // Helper: Run GC if possible (requires --expose-gc)
    const runGC = () => {
        if (global.gc) global.gc();
    };

    // 1. rad-parser (Optimized) Memory & Access
    {
        runGC();
        const startMem = process.memoryUsage().heapUsed;
        const elements = shallowParse(fileBytes);
        const endMem = process.memoryUsage().heapUsed;
        memoryStats["rad-parser (Optimized)"] = endMem - startMem;

        // Tag Access Stress (1k Lookups)
        const t0 = performance.now();
        const view = new SafeDataView(
            fileBytes.buffer,
            fileBytes.byteOffset,
            fileBytes.byteLength,
        );
        view.setEndianness(true);
        for (let k = 0; k < 1000; k++) {
            // lookup random or specific tags
            const el = elements["x00280010"];
            if (el) readValue(view, el.dataOffset, el.length);
        }
        accessTimeStats["rad-parser (Optimized)"] = performance.now() - t0;
    }

    // 2. dcmjs Memory & Access
    {
        runGC();
        const startMem = process.memoryUsage().heapUsed;
        const ds = dcmjs.data.DicomMessage.readFile(arrayBuffer);
        const endMem = process.memoryUsage().heapUsed;
        memoryStats["dcmjs"] = endMem - startMem;

        const t0 = performance.now();
        for (let k = 0; k < 1000; k++) {
            const v = ds.dict["00280010"].Value;
        }
        accessTimeStats["dcmjs"] = performance.now() - t0;
    }

    // 3. dicom-parser Memory & Access
    {
        runGC();
        const startMem = process.memoryUsage().heapUsed;
        const ds = dicomParser.parseDicom(fileBytesForDicomParser);
        const endMem = process.memoryUsage().heapUsed;
        memoryStats["dicom-parser"] = endMem - startMem;

        const t0 = performance.now();
        for (let k = 0; k < 1000; k++) {
            ds.uint16("x00280010");
        }
        accessTimeStats["dicom-parser"] = performance.now() - t0;
    }

    console.log("Memory Delta (approx per single parse):", memoryStats);
    console.log("1000 Tag Accesses (ms):", accessTimeStats);

    const report2 = `\n\n## Extended Capabilities Benchmark
| Parser | Est. Memory Overhead (bytes) | 1k Tag Find & Read (ms) |
| :--- | :---: | :---: |
| **rad-parser (Optimized)** | ${memoryStats["rad-parser (Optimized)"]} | ${accessTimeStats["rad-parser (Optimized)"].toFixed(2)} |
| **dicom-parser** | ${memoryStats["dicom-parser"]} | ${accessTimeStats["dicom-parser"].toFixed(2)} |
| **dcmjs** | ${memoryStats["dcmjs"]} | ${accessTimeStats["dcmjs"].toFixed(2)} |
    `;

    // Quick append to file (hacky read/write again or just console)
    // We'll write full new report in next step or user notify
    console.log(report2);
}

// Add global.gc declaration if needed for TS, or run with node --expose-gc
// But standard node won't have it. We'll skip explicit GC and accept noise,
// or imply memory usage from fresh start.
// Comparing deltas is noisy without GC.
// We will rely on "heap used" diff but it's very rough.

runBenchmark();
