import { fullParse } from "../src/index";
import dcmjs from "dcmjs";
import * as fs from "fs";
import * as path from "path";

// Use the known uncompressed file
const TEST_FILE_PATH = path.resolve(
    process.cwd(),
    "test_data/patient/DICOM/18CBDD76"
);
const OUT_DIR = path.resolve(process.cwd(), "results");

function writeBMP(
    filename: string,
    width: number,
    height: number,
    data: Uint8Array
) {
    // Basic 8-bit Grayscale BMP Header
    const fileSize = 54 + 1024 + data.length; // Header + Palette + Data
    const buffer = Buffer.alloc(fileSize);

    // Bitmap File Header
    buffer.write("BM", 0); // Signature
    buffer.writeUInt32LE(fileSize, 2); // File size
    buffer.writeUInt32LE(54 + 1024, 10); // Offset to data

    // DIB Header (BITMAPINFOHEADER)
    buffer.writeUInt32LE(40, 14); // Header size
    buffer.writeInt32LE(width, 18); // Width
    buffer.writeInt32LE(-height, 22); // Height (top-down)
    buffer.writeUInt16LE(1, 26); // Planes
    buffer.writeUInt16LE(8, 28); // BPP (8-bit)
    buffer.writeUInt32LE(0, 30); // Compression (BI_RGB)
    buffer.writeUInt32LE(data.length, 34); // Image size
    buffer.writeUInt32LE(0, 46); // Colors used (256)

    // Palette (Grayscale)
    let offset = 54;
    for (let i = 0; i < 256; i++) {
        buffer.writeUInt8(i, offset++); // B
        buffer.writeUInt8(i, offset++); // G
        buffer.writeUInt8(i, offset++); // R
        buffer.writeUInt8(0, offset++); // A
    }

    // Data
    // BMP lines must be 4-byte aligned. 484 is divisible by 4.
    // Copy data
    // Assuming data is row-major
    // Handle stride if needed, but 484 is 4-byte aligned.

    // Copy to buffer
    const dataOffset = 54 + 1024;
    // We might need to flip if not top-down, but we set strictly negative height for top-down
    for (let i = 0; i < data.length; i++) {
        buffer.writeUInt8(data[i], dataOffset + i);
    }

    fs.writeFileSync(filename, buffer);
    console.log(`Saved ${filename}`);
}

import dicomParser from "dicom-parser";
import { DicomReader } from "efferent-dicom";

function processData() {
    if (!fs.existsSync(TEST_FILE_PATH)) {
        console.error("Test file not found");
        return;
    }

    const fileBuffer = fs.readFileSync(TEST_FILE_PATH);
    const arrayBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength
    );

    // Common 8-bit converter
    const to8Bit = (data: Uint8Array, width: number, height: number) => {
        const numPixels = width * height;
        if (data.length < numPixels * 2) {
            console.warn(
                `Data length ${data.length} too small for ${width}x${height} Image`
            );
            return new Uint8Array(numPixels);
        }
        const out = new Uint8Array(numPixels);
        const view = new DataView(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );

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

    // 1. Rad Parser
    console.log("Processing with rad-parser...");
    try {
        const radDataset = fullParse(new Uint8Array(arrayBuffer));
        const decodeUS = (v: any) => {
            if (typeof v === "string") {
                return Buffer.from(v, "binary").readUInt16LE(0);
            }
            return v;
        };
        const radRows = decodeUS(radDataset.dict["x00280010"].Value);
        const radCols = decodeUS(radDataset.dict["x00280011"].Value);
        console.log(`RadParser dims: ${radCols}x${radRows}`);
        const radPixelData = radDataset.dict["x7fe00010"].Value as Uint8Array;

        if (radPixelData) {
            const rad8Bit = to8Bit(radPixelData, radCols, radRows);
            writeBMP(
                path.join(OUT_DIR, "rad_parser_output.bmp"),
                radCols,
                radRows,
                rad8Bit
            );
        }
    } catch (e) {
        console.error("RadParser error:", e);
    }

    // 2. Dcmjs
    console.log("Processing with dcmjs...");
    try {
        const dcmjsDataset = dcmjs.data.DicomMessage.readFile(arrayBuffer);
        const dcmjsRows = dcmjsDataset.dict["00280010"].Value;
        const dcmjsCols = dcmjsDataset.dict["00280011"].Value;
        console.log(`Dcmjs dims: ${dcmjsCols}x${dcmjsRows}`);

        let dcmjsPixelDataBytes = new Uint8Array(0);
        const dcmjsVal = dcmjsDataset.dict["7FE00010"].Value;
        if (
            Array.isArray(dcmjsVal) &&
            dcmjsVal.length > 0 &&
            dcmjsVal[0] instanceof ArrayBuffer
        ) {
            dcmjsPixelDataBytes = new Uint8Array(dcmjsVal[0]);
        }
        if (dcmjsPixelDataBytes.length > 0) {
            const dcmjs8Bit = to8Bit(dcmjsPixelDataBytes, dcmjsCols, dcmjsRows);
            writeBMP(
                path.join(OUT_DIR, "dcmjs_output.bmp"),
                dcmjsCols,
                dcmjsRows,
                dcmjs8Bit
            );
        }
    } catch (e) {
        console.error("Dcmjs error:", e);
    }

    // 3. dicom-parser
    console.log("Processing with dicom-parser...");
    try {
        const byteArray = new Uint8Array(arrayBuffer);
        const dpDataSet = dicomParser.parseDicom(byteArray);

        // Debug tag format
        const tags = Object.keys(dpDataSet.elements);
        // console.log('dicom-parser tags:', tags.slice(0, 5));

        // Tags are typically x00000000
        const rowsElem = dpDataSet.elements["x00280010"];
        const colsElem = dpDataSet.elements["x00280011"];

        if (!rowsElem || !colsElem) {
            throw new Error(
                "Using dicom-parser: Dimensions not found (tags x00280010/x00280011)"
            );
        }

        // dicom-parser doesn't automatically parse values to numbers in all cases, helpers needed?
        // dpDataSet.uint16 should work
        const dpRows = dpDataSet.uint16("x00280010");
        const dpCols = dpDataSet.uint16("x00280011");
        console.log(`dicom-parser dims: ${dpCols}x${dpRows}`);

        const element = dpDataSet.elements["x7fe00010"];
        if (!element) throw new Error("PixelData element x7fe00010 not found");

        const dpPixelData = byteArray.slice(
            element.dataOffset,
            element.dataOffset + element.length
        );

        if (dpPixelData) {
            const dp8Bit = to8Bit(dpPixelData, dpCols, dpRows);
            writeBMP(
                path.join(OUT_DIR, "dicom_parser_output.bmp"),
                dpCols,
                dpRows,
                dp8Bit
            );
        }
    } catch (e) {
        console.error("dicom-parser error:", e);
    }

    console.log("Starting efferent-dicom...");
    // 4. efferent-dicom
    try {
        // ... existing efferent code
        // The issue might be that DicomReader is not a constructor or something
        console.log("Instantiating DicomReader...");
        // Check if DicomReader is available
        if (!DicomReader) {
            throw new Error("DicomReader is undefined");
        }
        const reader = new DicomReader(new Uint8Array(arrayBuffer));
        // Try to find a read method
        // Inspect instance
        // console.log('Reader keys:', Object.keys(reader));
        // Assuming read() based on standard simple parser design
        // If this fails, we just skip with warning
    } catch (e) {
        console.warn("efferent-dicom error:", e);
    }
}

processData();
