import * as fs from "fs";
import * as path from "path";
import "../src/codecs/auto-register"; // Make sure codecs are registered
import { DicomDataSet } from "../src/core/types";
import { write } from "../src/core/writer";
import { parse as parser } from "../src/index"; // Ensure codecs are loaded via side-effects or explicit registration if needed
import { transcode } from "../src/utils/transcode";

// Input file
const INPUT_FILE = path.resolve(__dirname, "../test_data/TEST_STUDY/18CBDD76");
const OUTPUT_DIR = path.resolve(__dirname, "../test_data/codec_test");

// Target Transfer Syntaxes
// Target Transfer Syntaxes (Only those supported for encoding)
// const TRANSFER_SYNTAXES = [
//     { uid: "1.2.840.10008.1.2", name: "Implicit_VR_LE" },
//     { uid: "1.2.840.10008.1.2.1", name: "Explicit_VR_LE" },
const TRANSFER_SYNTAXES = [
    { uid: "1.2.840.10008.1.2.4.50", name: "JPEG_Baseline" },
];
//     // { uid: "1.2.840.10008.1.2.4.51", name: "JPEG_Extended" },
//     { uid: "1.2.840.10008.1.2.4.80", name: "JPEG_LS_Lossless" },
//     { uid: "1.2.840.10008.1.2.4.81", name: "JPEG_LS_Near_Lossless" },
//     { uid: "1.2.840.10008.1.2.4.90", name: "JPEG_2000_Lossless" },
//     { uid: "1.2.840.10008.1.2.4.91", name: "JPEG_2000_Lossy" },
//     { uid: "1.2.840.10008.1.2.5", name: "RLE_Lossless" },
// ];

async function main() {
    console.log(`Setting up output directory: ${OUTPUT_DIR}`);
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log(`Reading input file: ${INPUT_FILE}`);
    if (!fs.existsSync(INPUT_FILE)) {
        console.error("Input file not found!");
        process.exit(1);
    }

    const buffer = fs.readFileSync(INPUT_FILE);
    // Parse using the main parser which should have codecs set up (via index-codecs import)
    // Note: parser() returns a dataset.
    // We need to pass a Uint8Array.
    const data = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
    );

    let dataset: DicomDataSet;
    try {
        dataset = parser(data) as DicomDataSet;
        console.log("Successfully parsed input dataset.");
    } catch (e) {
        console.error("Failed to parse input file:", e);
        process.exit(1);
    }

    for (const ts of TRANSFER_SYNTAXES) {
        console.log(`\n---------------------------------------------------`);
        console.log(`Attempting to transcode to ${ts.name} (${ts.uid})...`);
        try {
            // Re-parse to get fresh dataset
            const tempDataset = parser(data) as DicomDataSet;

            // Determine quality/ratio based on TS
            let quality = 90; // Default: high quality / low compression ratio
            if (ts.uid === "1.2.840.10008.1.2.4.90") quality = 0; // Forced Lossless
            if (ts.uid === "1.2.840.10008.1.2.4.91") quality = 20; // 20:1 compression ratio (if supported)

            console.log(`  Encoding with quality/ratio: ${quality}`);
            const startTime = performance.now();
            const transcodedDataset = await transcode(tempDataset, {
                targetTransferSyntax: ts.uid,
                quality,
            });
            const duration = performance.now() - startTime;
            console.log(`  Success (${duration.toFixed(0)}ms)`);

            const outBytes = write(transcodedDataset, {
                transferSyntax: ts.uid,
            });
            const outPath = path.join(OUTPUT_DIR, `${ts.name}.dcm`);
            fs.writeFileSync(outPath, outBytes);
            console.log(`  Saved to ${outPath} (${outBytes.length} bytes)`);
        } catch (e: any) {
            console.error(`  FAILED encoding ${ts.name}:`);
            console.error(e.message);
            // console.error(e.stack);
        }
    }
}

main().catch(e => {
    console.error("Fatal error:", e);
    process.exit(1);
});
