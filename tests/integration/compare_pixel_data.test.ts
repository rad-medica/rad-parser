import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import dcmjs from "dcmjs";
import { parse } from "../../src/index";

const TEST_DIR = path.resolve(__dirname, "../test_data/patient/DICOM");

describe("Pixel Data Comparison with dcmjs", () => {
    it("should match pixel data from dcmjs for multiple files", () => {
        // 1. Get list of files
        if (!fs.existsSync(TEST_DIR)) {
            console.warn(`Test directory not found: ${TEST_DIR}`);
            return;
        }

        const files = fs
            .readdirSync(TEST_DIR)
            .filter((f) => !f.includes(".zip") && !f.includes("DICOMDIR"))
            .slice(0, 5); // Test first 5 files

        for (const file of files) {
            const filePath = path.join(TEST_DIR, file);
            // console.log(`Testing file: ${file}`);

            const fileBuffer = fs.readFileSync(filePath);
            // Skip directories
            if (fs.lstatSync(filePath).isDirectory()) continue;

            const arrayBuffer = fileBuffer.buffer.slice(
                fileBuffer.byteOffset,
                fileBuffer.byteOffset + fileBuffer.byteLength,
            );

            // 2. Parse with dcmjs
            let dcmjsPixelData;
            try {
                const dcmjsDataset =
                    dcmjs.data.DicomMessage.readFile(arrayBuffer);
                dcmjsPixelData = dcmjsDataset.dict["7FE00010"].Value;
            } catch (e) {
                console.warn(`dcmjs failed to parse ${file}: ${e}`);
                continue;
            }

            // 3. Parse with rad-parser
            let radPixelData;
            try {
                const radDataset = parse(new Uint8Array(arrayBuffer), {
                    type: "full",
                });
                const radPixelDataElement = radDataset.dict["x7fe00010"];
                radPixelData = radPixelDataElement?.Value;
            } catch (e) {
                console.error(`rad-parser failed to parse ${file}: ${e}`);
                throw e;
            }

            // Verify both found pixel data
            expect(dcmjsPixelData).toBeDefined();
            expect(radPixelData).toBeDefined();

            // 4. Compare

            // Convert dcmjs to Uint8Array
            let dcmjsBytes: Uint8Array;
            if (Array.isArray(dcmjsPixelData)) {
                if (
                    dcmjsPixelData.length === 1 &&
                    dcmjsPixelData[0] instanceof ArrayBuffer
                ) {
                    dcmjsBytes = new Uint8Array(dcmjsPixelData[0]);
                } else {
                    const totalLength = dcmjsPixelData.reduce(
                        (acc: number, buf: ArrayBuffer) => acc + buf.byteLength,
                        0,
                    );
                    dcmjsBytes = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const buf of dcmjsPixelData) {
                        dcmjsBytes.set(new Uint8Array(buf), offset);
                        offset += buf.byteLength;
                    }
                }
            } else if (dcmjsPixelData instanceof ArrayBuffer) {
                dcmjsBytes = new Uint8Array(dcmjsPixelData);
            } else {
                console.warn(
                    `Skipping ${file}: Unknown dcmjs pixel data format`,
                );
                continue;
            }

            // Convert rad-parser to Uint8Array
            let radBytes: Uint8Array;
            if (radPixelData instanceof Uint8Array) {
                radBytes = radPixelData;
            } else if (Array.isArray(radPixelData)) {
                const totalLength = radPixelData.reduce(
                    (acc: number, buf: Uint8Array) => acc + buf.length,
                    0,
                );
                radBytes = new Uint8Array(totalLength);
                let offset = 0;
                for (const buf of radPixelData) {
                    radBytes.set(buf, offset);
                    offset += buf.length;
                }
            } else {
                console.warn(
                    `Skipping ${file}: Unknown rad-parser pixel data format`,
                );
                continue;
            }

            // Compare sizes
            expect(radBytes.length, `Size mismatch for ${file}`).toBe(
                dcmjsBytes.length,
            );

            // Scan for mismatch
            let mismatch = -1;
            for (let i = 0; i < radBytes.length; i++) {
                if (radBytes[i] !== dcmjsBytes[i]) {
                    mismatch = i;
                    break;
                }
            }

            if (mismatch !== -1) {
                console.error(
                    `Mismatch in ${file} at byte ${mismatch}. Rad: ${radBytes[mismatch]}, Dcmjs: ${dcmjsBytes[mismatch]}`,
                );
            }
            expect(mismatch, `Content mismatch for ${file}`).toBe(-1);
        }
    });
});
