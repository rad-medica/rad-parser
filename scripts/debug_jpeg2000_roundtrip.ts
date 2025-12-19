/**
 * Debug JPEG 2000 Lossless round-trip (encode → write → read → decode)
 */

import * as fs from "fs";
import * as path from "path";
import "../src/codecs/auto-register";
import { decodePixelData } from "../src/core/codec-helpers";
import { write } from "../src/core/writer";
import { parse as parser } from "../src/index";
import { extractPixelData } from "../src/utils/pixelDataExtractor";
import { transcode } from "../src/utils/transcode";

const TEST_FILE =
    process.argv[2] ||
    path.resolve(__dirname, "../test_data/EDGE_CASES/ALL/CT_small.dcm");
const OUTPUT_DIR = path.resolve(__dirname, "../test_data/debug_j2k_output");

async function main() {
    console.log("Debugging JPEG 2000 Lossless Round-Trip...\n");

    // Read original
    const originalData = fs.readFileSync(TEST_FILE);
    const originalDataset = parser(
        new Uint8Array(
            originalData.buffer,
            originalData.byteOffset,
            originalData.byteLength
        )
    );

    const rows = originalDataset.uint16("x00280010") || 0;
    const columns = originalDataset.uint16("x00280011") || 0;
    const bits = originalDataset.uint16("x00280100") || 8;
    const samples = originalDataset.uint16("x00280002") || 1;

    console.log(
        `Original: ${columns}x${rows}, ${bits}-bit, ${samples} samples\n`
    );

    // Get original pixel data
    const originalPixels = extractPixelData(originalDataset);
    if (!originalPixels || !(originalPixels.Value instanceof Uint8Array)) {
        console.error("Failed to extract original pixel data");
        return;
    }

    const pixelData = originalPixels.Value;
    console.log(`Original pixel data size: ${pixelData.length} bytes\n`);

    // Step 1: Transcode to JPEG 2000 Lossless
    console.log("Step 1: Transcoding to JPEG 2000 Lossless...");
    const transcoded = await transcode(originalDataset, {
        targetTransferSyntax: "1.2.840.10008.1.2.4.90", // Lossless
    });

    // Step 2: Write DICOM file
    console.log("Step 2: Writing DICOM file...");
    const outBytes = write(transcoded, {
        transferSyntax: "1.2.840.10008.1.2.4.90",
    });

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    const outPath = path.join(OUTPUT_DIR, "lossless_roundtrip.dcm");
    fs.writeFileSync(outPath, outBytes);
    console.log(`✓ Written: ${outBytes.length} bytes to ${outPath}\n`);

    // Step 3: Read DICOM file back
    console.log("Step 3: Reading DICOM file back...");
    const readData = fs.readFileSync(outPath);
    const readDataset = parser(
        new Uint8Array(
            readData.buffer,
            readData.byteOffset,
            readData.byteLength
        )
    );

    // Step 4: Extract pixel data
    console.log("Step 4: Extracting pixel data...");
    const pixelDataInfo = extractPixelData(readDataset);
    if (!pixelDataInfo) {
        console.error("✗ No pixel data found");
        return;
    }

    console.log(`Is Encapsulated: ${pixelDataInfo.isEncapsulated}`);
    console.log(`Is Array: ${Array.isArray(pixelDataInfo.Value)}`);

    if (pixelDataInfo.isEncapsulated) {
        const fragments = Array.isArray(pixelDataInfo.Value)
            ? (pixelDataInfo.Value as Uint8Array[])
            : [pixelDataInfo.Value as Uint8Array];

        console.log(`Number of fragments: ${fragments.length}`);
        console.log(
            `Fragment sizes: ${fragments.map(f => f.length).join(", ")}`
        );
        console.log(
            `First fragment first 20 bytes: ${Array.from(
                fragments[0]!.slice(0, 20)
            )
                .map(b => `0x${b.toString(16).padStart(2, "0")}`)
                .join(" ")}`
        );

        // Step 5: Decode
        console.log("\nStep 5: Decoding pixel data...");
        try {
            const decoded = await decodePixelData(
                "1.2.840.10008.1.2.4.90",
                fragments,
                {
                    rows,
                    columns,
                    samplesPerPixel: samples,
                    bitsAllocated: bits,
                    width: columns,
                    height: rows,
                }
            );
            console.log(`✓ Decoded: ${decoded.length} bytes`);
            console.log(`Expected: ${pixelData.length} bytes`);

            if (decoded.length === pixelData.length) {
                let differences = 0;
                for (
                    let i = 0;
                    i < Math.min(decoded.length, pixelData.length);
                    i++
                ) {
                    if (decoded[i] !== pixelData[i]) {
                        differences++;
                        if (differences <= 10) {
                            console.log(
                                `Difference at ${i}: original=0x${pixelData[i]!.toString(16)}, decoded=0x${decoded[i]!.toString(16)}`
                            );
                        }
                    }
                }
                console.log(`\nTotal differences: ${differences}`);
                if (differences === 0) {
                    console.log("✓ Perfect match!");
                }
            } else {
                console.log(
                    `✗ Size mismatch: expected ${pixelData.length}, got ${decoded.length}`
                );
            }
        } catch (e: any) {
            console.error(`✗ Decode failed: ${e.message || String(e)}`);
            if (e.stack) {
                console.error(e.stack);
            }
        }
    } else {
        console.log(
            "Pixel data is not encapsulated (unexpected for JPEG 2000)"
        );
    }
}

main().catch(console.error);
