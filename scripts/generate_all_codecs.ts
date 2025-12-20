import * as fs from "fs";
import * as path from "path";
import { JpegDecoder } from "../src/codecs/jpeg";
import { Jpeg2000Decoder } from "../src/codecs/jpeg2000";
import { JpegLosslessDecoder } from "../src/codecs/jpegLossless";
import { JpegLsDecoder } from "../src/codecs/jpegls";
import { RleCodec } from "../src/codecs/rle";
import { registry } from "../src/core/registry";
import { DicomDataSet } from "../src/core/types";
import { write } from "../src/core/writer";
import { parse as parser } from "../src/index";
import { transcode } from "../src/utils/transcode";

// Register all codecs
registry.register(new JpegDecoder());
registry.register(new Jpeg2000Decoder());
registry.register(new JpegLsDecoder());
registry.register(new RleCodec());
registry.register(new JpegLosslessDecoder());

const INPUT_FILE = path.resolve(__dirname, "../test_data/TEST_STUDY/18CBDD76");
const OUTPUT_DIR = path.resolve(__dirname, "../output_codecs");

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// List of Transfer Syntaxes to generate
const ENCODINGS = [
    { uid: "1.2.840.10008.1.2", name: "Implicit_VR_Little_Endian" },
    { uid: "1.2.840.10008.1.2.1", name: "Explicit_VR_Little_Endian" },
    { uid: "1.2.840.10008.1.2.2", name: "Explicit_VR_Big_Endian" },
    {
        uid: "1.2.840.10008.1.2.4.50",
        name: "JPEG_Baseline_Process1",
        quality: 90,
    },
    {
        uid: "1.2.840.10008.1.2.4.51",
        name: "JPEG_Extended_Process2_4",
        quality: 90,
    },
    { uid: "1.2.840.10008.1.2.4.57", name: "JPEG_Lossless_Process14" },
    { uid: "1.2.840.10008.1.2.4.70", name: "JPEG_Lossless_Selection_Value_1" },
    { uid: "1.2.840.10008.1.2.4.80", name: "JPEG_LS_Lossless" },
    {
        uid: "1.2.840.10008.1.2.4.81",
        name: "JPEG_LS_Near_Lossless",
        quality: 2,
    },
    { uid: "1.2.840.10008.1.2.4.90", name: "JPEG_2000_Lossless" },
    { uid: "1.2.840.10008.1.2.4.91", name: "JPEG_2000_Lossy", quality: 20 },
    { uid: "1.2.840.10008.1.2.5", name: "RLE_Lossless" },
];

function fixOverlayVRs(dataset: DicomDataSet) {
    for (const tag in dataset.dict) {
        if (tag.match(/^x60[0-9a-f]{2}/)) {
            const element = dataset.dict[tag];
            const elemHex = tag.substring(5, 9);
            const elem = parseInt(elemHex, 16);

            // Heuristic for Overlay VRs
            if (elem === 0x3000) {
                element.vr = "OB"; // Overlay Data -> force OB to avoid ENDIAN swapping issues with UN/OW ambiguity
            } else if (
                elem === 0x0010 ||
                elem === 0x0011 ||
                elem === 0x0015 ||
                elem === 0x0050 ||
                elem === 0x0051
            ) {
                element.vr = "US"; // Rows, Columns, Bits Allocated, etc.
            } else if (elem === 0x0022 || elem === 0x0040 || elem === 0x0045) {
                element.vr = "CS"; // Type, Subtype, Label
            } else if (elem === 0x1500) {
                element.vr = "LO"; // Label
            }
            // Default to UN if unknown, but 3000 is the big one.
        }
    }
}

async function generate() {
    console.log("Reading input file:", INPUT_FILE);
    const buffer = fs.readFileSync(INPUT_FILE);
    const originalTypedArray = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
    );
    let dataset: DicomDataSet;

    try {
        dataset = parser(originalTypedArray) as DicomDataSet;
    } catch (e) {
        console.error("Failed to parse input:", e);
        process.exit(1);
    }

    console.log("Generating files in:", OUTPUT_DIR);

    fixOverlayVRs(dataset);

    for (const config of ENCODINGS) {
        console.log(`Generating ${config.name} (${config.uid})...`);
        try {
            const start = performance.now();
            const transcoded = await transcode(dataset, {
                targetTransferSyntax: config.uid,
                quality: config.quality,
            });

            const encodedBytes = write(transcoded, {
                transferSyntax: config.uid,
            });
            const end = performance.now();

            const filename = `${config.name}.dcm`;
            const filepath = path.join(OUTPUT_DIR, filename);
            fs.writeFileSync(filepath, encodedBytes);

            console.log(
                `  -> Saved to ${filename} (${(encodedBytes.length / 1024).toFixed(2)} KB) in ${(end - start).toFixed(2)}ms`
            );
        } catch (e: any) {
            console.error(`  -> FAILED: ${e.message}`);
        }
    }

    console.log("\nGeneration complete.");
}

generate().catch(console.error);
