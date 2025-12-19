/**
 * Convert a DICOM image to all possible transfer syntaxes
 * Uses the transcode utility to convert an input DICOM file to all supported codecs
 */

import * as fs from "fs";
import * as path from "path";
import "../src/codecs/auto-register"; // Make sure codecs are registered
import { registry } from "../src/core/registry";
import { DicomDataSet } from "../src/core/types";
import { write } from "../src/core/writer";
import { parse as parser } from "../src/index";
import { transcode } from "../src/utils/transcode";

// Configuration
const INPUT_FILE =
    process.argv[2] ||
    path.resolve(__dirname, "../test_data/EDGE_CASES/ALL/CT_small.dcm");
const OUTPUT_DIR = path.resolve(__dirname, "../test_data/converted_codecs");

// All possible DICOM Transfer Syntaxes (both uncompressed and compressed)
const ALL_TRANSFER_SYNTAXES = [
    // Uncompressed
    {
        uid: "1.2.840.10008.1.2",
        name: "Implicit_VR_LE",
        description: "Implicit VR Little Endian",
    },
    {
        uid: "1.2.840.10008.1.2.1",
        name: "Explicit_VR_LE",
        description: "Explicit VR Little Endian",
    },
    {
        uid: "1.2.840.10008.1.2.2",
        name: "Explicit_VR_BE",
        description: "Explicit VR Big Endian",
    },

    // JPEG Baseline
    {
        uid: "1.2.840.10008.1.2.4.50",
        name: "JPEG_Baseline",
        description: "JPEG Baseline (Process 1)",
    },

    // JPEG 2000
    {
        uid: "1.2.840.10008.1.2.4.90",
        name: "JPEG_2000_Lossless",
        description: "JPEG 2000 Lossless Only",
    },
    {
        uid: "1.2.840.10008.1.2.4.91",
        name: "JPEG_2000_Lossy",
        description: "JPEG 2000",
    },

    // JPEG-LS
    {
        uid: "1.2.840.10008.1.2.4.80",
        name: "JPEG_LS_Lossless",
        description: "JPEG-LS Lossless",
    },
    {
        uid: "1.2.840.10008.1.2.4.81",
        name: "JPEG_LS_Near_Lossless",
        description: "JPEG-LS Near-Lossless",
    },

    // RLE
    {
        uid: "1.2.840.10008.1.2.5",
        name: "RLE_Lossless",
        description: "RLE Lossless",
    },
];

async function main() {
    console.log("=".repeat(80));
    console.log("DICOM Image Conversion to All Transfer Syntaxes");
    console.log("=".repeat(80));
    console.log(`Input file: ${INPUT_FILE}`);
    console.log(`Output directory: ${OUTPUT_DIR}\n`);

    // Check if input file exists
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Error: Input file not found: ${INPUT_FILE}`);
        process.exit(1);
    }

    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`Created output directory: ${OUTPUT_DIR}\n`);
    }

    // Read and parse input file
    console.log("Reading and parsing input file...");
    const buffer = fs.readFileSync(INPUT_FILE);
    const data = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
    );

    let dataset: DicomDataSet;
    try {
        dataset = parser(data) as DicomDataSet;
        console.log("✓ Successfully parsed input dataset");

        // Display image info
        const rows = dataset.uint16("x00280010") || 0;
        const columns = dataset.uint16("x00280011") || 0;
        const samples = dataset.uint16("x00280002") || 1;
        const bits = dataset.uint16("x00280100") || 8;
        const currentTS = dataset.string("x00020010") || "Unknown";

        console.log(`  Image dimensions: ${columns}x${rows}`);
        console.log(`  Samples per pixel: ${samples}`);
        console.log(`  Bits allocated: ${bits}`);
        console.log(`  Current Transfer Syntax: ${currentTS}\n`);
    } catch (e) {
        console.error("Failed to parse input file:", e);
        process.exit(1);
    }

    // Check which transfer syntaxes are supported for encoding
    console.log("Checking supported transfer syntaxes for encoding...\n");
    const supportedSyntaxes: typeof ALL_TRANSFER_SYNTAXES = [];

    for (const ts of ALL_TRANSFER_SYNTAXES) {
        // Uncompressed formats don't need codecs - they're always supported
        if (
            [
                "1.2.840.10008.1.2",
                "1.2.840.10008.1.2.1",
                "1.2.840.10008.1.2.2",
            ].includes(ts.uid)
        ) {
            supportedSyntaxes.push(ts);
            console.log(
                `✓ ${ts.name} (${ts.uid}) - Native format (no codec needed)`
            );
            continue;
        }

        // Check compressed formats
        try {
            const encoder = await registry.getEncoder(ts.uid);
            if (encoder && encoder.canEncode && encoder.canEncode(ts.uid)) {
                supportedSyntaxes.push(ts);
                console.log(`✓ ${ts.name} (${ts.uid}) - ${encoder.name}`);
            }
        } catch (e) {
            // Skip if error checking
        }
    }

    console.log(
        `\nFound ${supportedSyntaxes.length} supported transfer syntaxes\n`
    );
    console.log("=".repeat(80));
    console.log("Starting conversion...\n");

    const results: Array<{
        name: string;
        uid: string;
        success: boolean;
        duration: number;
        size: number;
        error?: string;
    }> = [];

    // Convert to each transfer syntax
    for (const ts of supportedSyntaxes) {
        const startTime = performance.now();
        console.log(
            `[${results.length + 1}/${supportedSyntaxes.length}] Converting to ${ts.name}...`
        );

        try {
            // Re-parse to get fresh dataset
            const tempDataset = parser(data) as DicomDataSet;

            // Determine quality/ratio based on TS
            let quality: number | undefined = undefined;
            if (ts.uid === "1.2.840.10008.1.2.4.90") {
                quality = 0; // Lossless
            } else if (ts.uid === "1.2.840.10008.1.2.4.91") {
                quality = 20; // 20:1 compression ratio
            } else if (ts.uid === "1.2.840.10008.1.2.4.50") {
                quality = 90; // High quality JPEG
            }

            // Transcode
            const transcodedDataset = await transcode(tempDataset, {
                targetTransferSyntax: ts.uid,
                quality,
            });

            // Write output file
            const outBytes = write(transcodedDataset, {
                transferSyntax: ts.uid,
            });

            const outPath = path.join(OUTPUT_DIR, `${ts.name}.dcm`);
            fs.writeFileSync(outPath, outBytes);

            const duration = performance.now() - startTime;
            const sizeKB = (outBytes.length / 1024).toFixed(2);

            console.log(
                `  ✓ Success (${duration.toFixed(0)}ms) - ${sizeKB} KB`
            );

            results.push({
                name: ts.name,
                uid: ts.uid,
                success: true,
                duration,
                size: outBytes.length,
            });
        } catch (e: any) {
            const duration = performance.now() - startTime;
            const errorMsg = e.message || String(e);
            console.log(`  ✗ Failed (${duration.toFixed(0)}ms): ${errorMsg}`);

            results.push({
                name: ts.name,
                uid: ts.uid,
                success: false,
                duration,
                size: 0,
                error: errorMsg,
            });
        }

        console.log();
    }

    // Print summary
    console.log("=".repeat(80));
    console.log("Conversion Summary");
    console.log("=".repeat(80));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\nTotal: ${results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}\n`);

    if (successful.length > 0) {
        console.log("Successful conversions:");
        for (const r of successful) {
            const sizeKB = (r.size / 1024).toFixed(2);
            console.log(
                `  ✓ ${r.name}: ${sizeKB} KB (${r.duration.toFixed(0)}ms)`
            );
        }
    }

    if (failed.length > 0) {
        console.log("\nFailed conversions:");
        for (const r of failed) {
            console.log(`  ✗ ${r.name}: ${r.error}`);
        }
    }

    console.log(`\nOutput files saved to: ${OUTPUT_DIR}`);
    console.log("=".repeat(80));
}

main().catch(e => {
    console.error("Fatal error:", e);
    process.exit(1);
});
