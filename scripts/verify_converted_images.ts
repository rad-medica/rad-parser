/**
 * Verify that converted DICOM images can be read back correctly
 * Checks if the images are malformed by attempting to parse and extract pixel data
 */

import * as fs from "fs";
import * as path from "path";
import "../src/codecs/auto-register";
import { decodePixelData } from "../src/core/codec-helpers";
import { parse as parser } from "../src/index";

const CONVERTED_DIR = path.resolve(__dirname, "../test_data/converted_codecs");

async function verifyImage(filePath: string): Promise<{
    success: boolean;
    error?: string;
    pixelDataSize?: number;
    dimensions?: string;
}> {
    try {
        const buffer = fs.readFileSync(filePath);
        const data = new Uint8Array(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength
        );

        const dataset = parser(data);

        const rows = dataset.uint16("x00280010") || 0;
        const columns = dataset.uint16("x00280011") || 0;
        const samples = dataset.uint16("x00280002") || 1;
        const bits = dataset.uint16("x00280100") || 8;
        const transferSyntax = dataset.string("x00020010") || "Unknown";

        // Try to decode pixel data
        const pixelDataInfo = dataset.dict["x7fe00010"];
        if (!pixelDataInfo) {
            return { success: false, error: "No pixel data found" };
        }

        let pixelDataSize = 0;
        if (pixelDataInfo.Value instanceof Uint8Array) {
            pixelDataSize = pixelDataInfo.Value.length;
        } else if (Array.isArray(pixelDataInfo.Value)) {
            pixelDataSize = (pixelDataInfo.Value as Uint8Array[]).reduce(
                (sum, frag) => sum + frag.length,
                0
            );
        }

        // Try to decode if compressed
        if (pixelDataInfo.isEncapsulated) {
            try {
                const fragments = Array.isArray(pixelDataInfo.Value)
                    ? (pixelDataInfo.Value as Uint8Array[])
                    : [pixelDataInfo.Value as Uint8Array];

                if (fragments.length === 0 || fragments[0]!.length === 0) {
                    return {
                        success: false,
                        error: "Empty pixel data fragments",
                        dimensions: `${columns}x${rows}`,
                    };
                }

                let decoded: Uint8Array | undefined;
                try {
                    const result = await decodePixelData(
                        transferSyntax,
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
                    decoded = result;
                } catch (e: any) {
                    return {
                        success: false,
                        error: `Decode failed: ${e.message || String(e)}`,
                        dimensions: `${columns}x${rows}`,
                    };
                }

                if (!decoded) {
                    return {
                        success: false,
                        error: "Decode returned null or undefined",
                        dimensions: `${columns}x${rows}`,
                    };
                }

                if (!(decoded instanceof Uint8Array)) {
                    return {
                        success: false,
                        error: `Decode returned invalid type: ${typeof decoded}, expected Uint8Array`,
                        dimensions: `${columns}x${rows}`,
                    };
                }

                if (
                    typeof decoded.length !== "number" ||
                    isNaN(decoded.length) ||
                    decoded.length === 0
                ) {
                    return {
                        success: false,
                        error: `Decode returned invalid length: ${decoded.length} (type: ${typeof decoded.length})`,
                        dimensions: `${columns}x${rows}`,
                    };
                }

                pixelDataSize = decoded.length;

                if (pixelDataSize === 0) {
                    return {
                        success: false,
                        error: "Decode returned empty result",
                        dimensions: `${columns}x${rows}`,
                    };
                }
            } catch (e: any) {
                return {
                    success: false,
                    error: `Failed to decode pixel data: ${e.message || String(e)}`,
                    dimensions: `${columns}x${rows}`,
                };
            }
        } else {
            // For uncompressed data, get size directly
            if (pixelDataInfo.Value instanceof Uint8Array) {
                pixelDataSize = pixelDataInfo.Value.length;
            } else if (Array.isArray(pixelDataInfo.Value)) {
                pixelDataSize = (pixelDataInfo.Value as Uint8Array[]).reduce(
                    (sum, frag) => sum + (frag?.length || 0),
                    0
                );
            }
        }

        const expectedSize = rows * columns * samples * (bits / 8);
        if (isNaN(expectedSize) || isNaN(pixelDataSize)) {
            return {
                success: false,
                error: `Invalid size calculation: expectedSize=${expectedSize}, pixelDataSize=${pixelDataSize}, rows=${rows}, columns=${columns}, samples=${samples}, bits=${bits}`,
                pixelDataSize,
                dimensions: `${columns}x${rows}`,
            };
        }
        if (pixelDataSize !== expectedSize) {
            return {
                success: false,
                error: `Pixel data size mismatch: expected ${expectedSize}, got ${pixelDataSize}`,
                pixelDataSize,
                dimensions: `${columns}x${rows}`,
            };
        }

        return {
            success: true,
            pixelDataSize,
            dimensions: `${columns}x${rows}`,
        };
    } catch (e: any) {
        return {
            success: false,
            error: e.message || String(e),
        };
    }
}

async function main() {
    console.log("=".repeat(80));
    console.log("Verifying Converted DICOM Images");
    console.log("=".repeat(80));
    console.log(`Checking directory: ${CONVERTED_DIR}\n`);

    if (!fs.existsSync(CONVERTED_DIR)) {
        console.error(`Directory not found: ${CONVERTED_DIR}`);
        console.error("Please run convert_to_all_codecs.ts first");
        process.exit(1);
    }

    const files = fs.readdirSync(CONVERTED_DIR);
    const dicomFiles = files.filter(f => f.endsWith(".dcm"));

    if (dicomFiles.length === 0) {
        console.error("No DICOM files found in converted directory");
        process.exit(1);
    }

    console.log(`Found ${dicomFiles.length} DICOM files to verify\n`);

    const results: Array<{
        file: string;
        success: boolean;
        error?: string;
        pixelDataSize?: number;
        dimensions?: string;
    }> = [];

    for (const file of dicomFiles) {
        const filePath = path.join(CONVERTED_DIR, file);
        console.log(`Verifying ${file}...`);

        const result = await verifyImage(filePath);
        results.push({
            file,
            ...result,
        });

        if (result.success) {
            console.log(
                `  ✓ Valid - ${result.dimensions}, ${result.pixelDataSize} bytes`
            );
        } else {
            console.log(`  ✗ Invalid: ${result.error}`);
        }
        console.log();
    }

    // Summary
    console.log("=".repeat(80));
    console.log("Verification Summary");
    console.log("=".repeat(80));

    const valid = results.filter(r => r.success);
    const invalid = results.filter(r => !r.success);

    console.log(`\nTotal: ${results.length}`);
    console.log(`Valid: ${valid.length}`);
    console.log(`Invalid: ${invalid.length}\n`);

    if (invalid.length > 0) {
        console.log("Invalid/Malformed Images:");
        for (const r of invalid) {
            console.log(`  ✗ ${r.file}: ${r.error}`);
        }
    }

    if (valid.length > 0) {
        console.log("\nValid Images:");
        for (const r of valid) {
            console.log(
                `  ✓ ${r.file}: ${r.dimensions}, ${r.pixelDataSize} bytes`
            );
        }
    }

    console.log("=".repeat(80));
}

main().catch(e => {
    console.error("Fatal error:", e);
    process.exit(1);
});
