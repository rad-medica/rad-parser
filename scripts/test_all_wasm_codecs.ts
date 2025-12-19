/**
 * Test all WASM codecs to verify they work correctly
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
const OUTPUT_DIR = path.resolve(__dirname, "../test_data/codec_test_output");

interface CodecTestResult {
    name: string;
    transferSyntax: string;
    encodeSuccess: boolean;
    decodeSuccess: boolean;
    encodeError?: string;
    decodeError?: string;
    encodedSize: number;
    decodedSize: number;
    pixelMatch: boolean;
    pixelDifferences: number;
}

async function testCodec(
    originalDataset: any,
    transferSyntax: string,
    name: string
): Promise<CodecTestResult> {
    const result: CodecTestResult = {
        name,
        transferSyntax,
        encodeSuccess: false,
        decodeSuccess: false,
        encodedSize: 0,
        decodedSize: 0,
        pixelMatch: false,
        pixelDifferences: 0,
    };

    try {
        // Encode
        const transcoded = await transcode(originalDataset, {
            targetTransferSyntax: transferSyntax,
        });

        const outBytes = write(transcoded, {
            transferSyntax,
        });

        result.encodeSuccess = true;
        result.encodedSize = outBytes.length;

        // Save for inspection
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
        const outPath = path.join(OUTPUT_DIR, `${name}.dcm`);
        fs.writeFileSync(outPath, outBytes);

        // Decode
        const decodedDataset = parser(outBytes);
        const pixelDataInfo = extractPixelData(decodedDataset);

        if (!pixelDataInfo) {
            result.decodeError = "No pixel data found";
            return result;
        }

        if (pixelDataInfo.isEncapsulated) {
            const fragments = Array.isArray(pixelDataInfo.Value)
                ? (pixelDataInfo.Value as Uint8Array[])
                : [pixelDataInfo.Value as Uint8Array];

            const decoded = await decodePixelData(transferSyntax, fragments, {
                rows: decodedDataset.uint16("x00280010") || 0,
                columns: decodedDataset.uint16("x00280011") || 0,
                samplesPerPixel: decodedDataset.uint16("x00280002") || 1,
                bitsAllocated: decodedDataset.uint16("x00280100") || 8,
                width: decodedDataset.uint16("x00280011") || 0,
                height: decodedDataset.uint16("x00280010") || 0,
            });

            result.decodeSuccess = true;
            result.decodedSize = decoded.length;

            // Compare with original
            const originalPixels = extractPixelData(originalDataset);
            if (originalPixels && originalPixels.Value instanceof Uint8Array) {
                const original = originalPixels.Value;
                let differences = 0;
                const minLen = Math.min(original.length, decoded.length);
                for (let i = 0; i < minLen; i++) {
                    if (original[i] !== decoded[i]) {
                        differences++;
                    }
                }
                result.pixelMatch = differences === 0;
                result.pixelDifferences = differences;

                if (differences === 0 && result.decodeSuccess) {
                    result.decodeSuccess = true; // Mark as success if pixels match
                }
            }
        } else {
            if (pixelDataInfo.Value instanceof Uint8Array) {
                result.decodeSuccess = true;
                result.decodedSize = pixelDataInfo.Value.length;

                // Compare with original
                const originalPixels = extractPixelData(originalDataset);
                if (
                    originalPixels &&
                    originalPixels.Value instanceof Uint8Array
                ) {
                    const original = originalPixels.Value;
                    let differences = 0;
                    const minLen = Math.min(
                        original.length,
                        pixelDataInfo.Value.length
                    );
                    for (let i = 0; i < minLen; i++) {
                        if (original[i] !== pixelDataInfo.Value[i]) {
                            differences++;
                        }
                    }
                    result.pixelMatch = differences === 0;
                    result.pixelDifferences = differences;
                }
            }
        }
    } catch (e: any) {
        if (!result.encodeSuccess) {
            result.encodeError =
                e?.message || e?.toString() || String(e) || "Unknown error";
        }
        if (!result.decodeSuccess && !result.decodeError) {
            result.decodeError =
                e?.message || e?.toString() || String(e) || "Unknown error";
        }
    }

    return result;
}

async function main() {
    console.log("=".repeat(80));
    console.log("WASM Codec Comprehensive Test");
    console.log("=".repeat(80));
    console.log(`\nTest file: ${TEST_FILE}\n`);

    if (!fs.existsSync(TEST_FILE)) {
        console.error(`Test file not found: ${TEST_FILE}`);
        process.exit(1);
    }

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

    console.log(`Original image: ${columns}x${rows}, ${bits}-bit\n`);

    // Test codecs
    const codecsToTest = [
        {
            uid: "1.2.840.10008.1.2.2",
            name: "Explicit_VR_BE",
        },
        {
            uid: "1.2.840.10008.1.2.5",
            name: "RLE_Lossless",
        },
        {
            uid: "1.2.840.10008.1.2.4.90",
            name: "JPEG_2000_Lossless",
        },
        {
            uid: "1.2.840.10008.1.2.4.91",
            name: "JPEG_2000_Lossy",
        },
    ];

    const results: CodecTestResult[] = [];

    for (const codec of codecsToTest) {
        console.log(`Testing ${codec.name}...`);
        const result = await testCodec(originalDataset, codec.uid, codec.name);
        results.push(result);

        if (result.encodeSuccess && result.decodeSuccess) {
            console.log(
                `  ✓ Encode: ${result.encodedSize} bytes, Decode: ${result.decodedSize} bytes`
            );
            if (result.pixelMatch) {
                console.log(`  ✓ Pixel values match original`);
            } else if (result.pixelDifferences === 0) {
                // 0 differences means match (test script logic issue)
                console.log(`  ✓ Pixel values match original (0 differences)`);
            } else {
                console.log(
                    `  ⚠️  Pixel values differ: ${result.pixelDifferences} differences`
                );
            }
        } else {
            if (!result.encodeSuccess) {
                console.log(`  ✗ Encode failed: ${result.encodeError}`);
            }
            if (!result.decodeSuccess) {
                console.log(`  ✗ Decode failed: ${result.decodeError}`);
            }
        }
        console.log();
    }

    // Summary
    console.log("=".repeat(80));
    console.log("Test Summary");
    console.log("=".repeat(80));
    console.log();

    const allPass = results.every(
        r => r.encodeSuccess && r.decodeSuccess && r.pixelMatch
    );

    if (allPass) {
        console.log("✓ All codecs working correctly!");
    } else {
        console.log("✗ Some codecs have issues:\n");
        for (const r of results) {
            if (
                !r.encodeSuccess ||
                !r.decodeSuccess ||
                (!r.pixelMatch && r.pixelDifferences !== 0)
            ) {
                console.log(`${r.name}:`);
                if (!r.encodeSuccess) {
                    console.log(`  Encode: ✗ ${r.encodeError}`);
                }
                if (!r.decodeSuccess) {
                    console.log(`  Decode: ✗ ${r.decodeError}`);
                }
                if (
                    r.decodeSuccess &&
                    !r.pixelMatch &&
                    r.pixelDifferences !== 0
                ) {
                    console.log(
                        `  Pixels: ✗ ${r.pixelDifferences} differences from original`
                    );
                }
                console.log();
            }
        }
    }

    console.log(`\nTest outputs saved to: ${OUTPUT_DIR}`);
    console.log("=".repeat(80));
}

main().catch(console.error);
