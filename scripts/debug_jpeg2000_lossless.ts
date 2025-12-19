/**
 * Debug JPEG 2000 Lossless encode/decode
 */

import * as fs from "fs";
import * as path from "path";
import "../src/codecs/auto-register";
import { ZigCodecs } from "../src/codecs/zig-codecs";
import { parse as parser } from "../src/index";
import { extractPixelData } from "../src/utils/pixelDataExtractor";

const TEST_FILE =
    process.argv[2] ||
    path.resolve(__dirname, "../test_data/EDGE_CASES/ALL/CT_small.dcm");

async function main() {
    console.log("Debugging JPEG 2000 Lossless...\n");

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

    // Try encoding with ZigCodecs directly
    const zigCodecs = new ZigCodecs();
    await zigCodecs.initCodec("j2k");

    console.log("Encoding with lossless=true...");
    try {
        const encoded = await zigCodecs.encodeJpeg2000(
            pixelData,
            columns,
            rows,
            bits,
            samples,
            true, // lossless
            undefined // quality (ignored for lossless)
        );
        console.log(`✓ Encoded: ${encoded.length} bytes`);
        console.log(
            `First 20 bytes: ${Array.from(encoded.slice(0, 20))
                .map(b => `0x${b.toString(16).padStart(2, "0")}`)
                .join(" ")}`
        );

        // Try decoding
        console.log("\nDecoding...");
        try {
            const decoded = await zigCodecs.decodeJpeg2000(encoded);
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
            console.error(e.stack);
        }
    } catch (e: any) {
        console.error(`✗ Encode failed: ${e.message || String(e)}`);
        console.error(e.stack);
    }
}

main().catch(console.error);
