import { fullParse } from "../src/index";
import dcmjs from "dcmjs";
import dicomParser from "dicom-parser";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

const TEST_FILE_PATH = path.resolve(
    process.cwd(),
    "test_data/patient/DICOM/18CBDD76",
);
const REPORT_FILE = path.resolve(process.cwd(), "results/benchmark_report.md");

// Helper to decode raw 'US' string from rad-parser
const decodeUS = (v: any) => {
    if (typeof v === "string") {
        return Buffer.from(v, "binary").readUInt16LE(0);
    }
    return v;
};

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

function runBenchmark() {
    if (!fs.existsSync(TEST_FILE_PATH)) {
        console.error("Test file not found");
        return;
    }

    const fileBuffer = fs.readFileSync(TEST_FILE_PATH);
    const fileBytes = new Uint8Array(fileBuffer);
    const arrayBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
    );

    const iterations = 50;
    const results: Record<string, number[]> = {
        "rad-parser": [],
        dcmjs: [],
        "dicom-parser": [],
    };

    console.log(`Starting benchmark (${iterations} iterations)...`);

    // Warmup
    console.log("Warmup...");
    for (let i = 0; i < 5; i++) {
        fullParse(fileBytes);
        dcmjs.data.DicomMessage.readFile(arrayBuffer);
        dicomParser.parseDicom(fileBytes);
    }

    // Benchmark rad-parser
    console.log("Benchmarking rad-parser...");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        const radDataset = fullParse(fileBytes);
        const rows = decodeUS(radDataset.dict["x00280010"].Value);
        const cols = decodeUS(radDataset.dict["x00280011"].Value);
        const pixelData = radDataset.dict["x7fe00010"].Value as Uint8Array;
        const bitmap = to8Bit(pixelData, cols, rows);

        const end = performance.now();
        results["rad-parser"].push(end - start);
    }

    // Benchmark dcmjs
    console.log("Benchmarking dcmjs...");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        // dcmjs needs ArrayBuffer
        const dcmjsDataset = dcmjs.data.DicomMessage.readFile(arrayBuffer);
        const rows = dcmjsDataset.dict["00280010"].Value;
        const cols = dcmjsDataset.dict["00280011"].Value;
        const val = dcmjsDataset.dict["7FE00010"].Value;
        let pixelDataBytes: Uint8Array;
        if (Array.isArray(val)) {
            pixelDataBytes = new Uint8Array(val[0]);
        } else {
            // fallback or assuming structure
            pixelDataBytes = new Uint8Array(0);
        }
        const bitmap = to8Bit(pixelDataBytes, cols, rows);

        const end = performance.now();
        results["dcmjs"].push(end - start);
    }

    // Benchmark dicom-parser
    console.log("Benchmarking dicom-parser...");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        const dpDataSet = dicomParser.parseDicom(fileBytes);
        const rows = dpDataSet.uint16("x00280010");
        const cols = dpDataSet.uint16("x00280011");
        const element = dpDataSet.elements["x7fe00010"];
        const pixelData = fileBytes.slice(
            element.dataOffset,
            element.dataOffset + element.length,
        );
        const bitmap = to8Bit(pixelData, cols, rows);

        const end = performance.now();
        results["dicom-parser"].push(end - start);
    }

    // Calculate stats
    const stats: any = {};
    for (const [name, times] of Object.entries(results)) {
        const sum = times.reduce((a, b) => a + b, 0);
        const avg = sum / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        // Median
        times.sort((a, b) => a - b);
        const mid = Math.floor(times.length / 2);
        const median =
            times.length % 2 !== 0
                ? times[mid]
                : (times[mid - 1] + times[mid]) / 2;

        stats[name] = { avg, min, max, median };
    }

    // Generate Report
    let md = `# Bitmap Generation Benchmark Results\n\n`;
    md += `Date: ${new Date().toISOString()}\n`;
    md += `Iterations: ${iterations}\n`;
    md += `File: ${path.basename(TEST_FILE_PATH)}\n\n`;

    md += `| Parser | Average (ms) | Median (ms) | Min (ms) | Max (ms) |\n`;
    md += `| :--- | :---: | :---: | :---: | :---: |\n`;

    for (const name of Object.keys(stats)) {
        const s = stats[name];
        md += `| **${name}** | ${s.avg.toFixed(2)} | ${s.median.toFixed(2)} | ${s.min.toFixed(2)} | ${s.max.toFixed(2)} |\n`;
    }

    md += `\n\n## Methodology\n`;
    md += `1. **Parse**: Full parsing of the DICOM file.\n`;
    md += `2. **Extract**: Accessing Rows, Columns, and Pixel Data elements.\n`;
    md += `3. **Convert**: Converting raw 16-bit pixel data to 8-bit grayscale bitmap buffer (min/max scaling).\n`;

    fs.writeFileSync(REPORT_FILE, md);
    console.log("Benchmark complete. Report saved to:", REPORT_FILE);
    console.log(stats);
}

runBenchmark();
