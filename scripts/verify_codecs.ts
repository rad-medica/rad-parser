import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
// import "../src/codecs/auto-register"; // DISABLED to avoid ljpeg crash
import { JpegDecoder } from "../src/codecs/jpeg";
import { Jpeg2000Decoder } from "../src/codecs/jpeg2000";
import { JpegLosslessDecoder } from "../src/codecs/jpegLossless";
import { JpegLsDecoder } from "../src/codecs/jpegls";
import { RleCodec } from "../src/codecs/rle";
import { ZigCodecs } from "../src/codecs/zig-codecs";
import { registry } from "../src/core/registry";
import { DicomDataSet } from "../src/core/types";
import { write } from "../src/core/writer";
import { parse as parser } from "../src/index";
import { transcode } from "../src/utils/transcode";

// Manual Registration
registry.register(new JpegDecoder());
registry.register(new Jpeg2000Decoder());
registry.register(new JpegLsDecoder());
registry.register(new RleCodec());
registry.register(new JpegLosslessDecoder());

// Configuration
const INPUT_FILE = path.resolve(__dirname, "../test_data/TEST_STUDY/18CBDD76");
const OUTPUT_DIR = path.resolve(__dirname, "../test_data/codec_verification");

// DICOM Transfer Syntaxes to Test
const TRANSFER_SYNTAXES = [
    { uid: "1.2.840.10008.1.2.4.50", name: "JPEG_Baseline", quality: 90 },
    { uid: "1.2.840.10008.1.2.4.51", name: "JPEG_Extended", quality: 90 },
    { uid: "1.2.840.10008.1.2.4.80", name: "JPEG_LS_Lossless", quality: 0 },
    {
        uid: "1.2.840.10008.1.2.4.81",
        name: "JPEG_LS_Near_Lossless",
        quality: 2,
    },
    { uid: "1.2.840.10008.1.2.4.90", name: "JPEG_2000_Lossless", quality: 0 },
    { uid: "1.2.840.10008.1.2.4.91", name: "JPEG_2000_Lossy", quality: 20 },
    { uid: "1.2.840.10008.1.2.5", name: "RLE_Lossless", quality: 0 },
];

interface TestResult {
    name: string;
    uid: string;
    impl: "WASM" | "JS";
    encodeTimeMs: number;
    decodeTimeMs: number;
    originalSize: number;
    encodedSize: number;
    compressionRatio: string;
    status: "PASS" | "FAIL";
    error?: string;
}

// Helper to compare pixel data
function compareBuffers(
    original: Uint8Array,
    decoded: Uint8Array,
    tolerance: number = 0
): boolean {
    if (original.length !== decoded.length) {
        console.error(
            `Size mismatch: Original ${original.length}, Decoded ${decoded.length}`
        );
        return false;
    }
    let maxDiff = 0;
    for (let i = 0; i < original.length; i++) {
        const diff = Math.abs(original[i]! - decoded[i]!);
        if (diff > maxDiff) maxDiff = diff;
        if (diff > tolerance) {
            console.error(
                `Pixel mismatch at ${i}: Original ${original[i]}, Decoded ${decoded[i]}, Diff ${diff}`
            );
            return false;
        }
    }
    // console.log(`Max pixel difference: ${maxDiff}`);
    return true;
}

async function runTest() {
    console.log(`Setting up output directory: ${OUTPUT_DIR}`);
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    if (!fs.existsSync(INPUT_FILE)) {
        console.error("Input file not found!");
        process.exit(1);
    }

    // 1. Read Original
    const buffer = fs.readFileSync(INPUT_FILE);
    const data = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
    );
    let originalDataset: DicomDataSet;
    try {
        originalDataset = parser(data) as DicomDataSet;
    } catch (e) {
        console.error("Failed to parse input:", e);
        process.exit(1);
    }

    console.log("Preparing raw reference data...");
    const rawDataset = await transcode(originalDataset, {
        targetTransferSyntax: "1.2.840.10008.1.2.1",
    });
    // Debug logging
    console.log(
        "Transcode complete. Dataset keys:",
        Object.keys(rawDataset.dict).filter(
            k => k.includes("7fe0") || k.includes("7FE0")
        )
    );
    if (rawDataset.dict["x7fe00010"])
        console.log(
            "Found x7fe00010, type:",
            typeof rawDataset.dict["x7fe00010"].Value
        );
    if (rawDataset.dict["7FE00010"]) console.log("Found 7FE00010");

    // Check if we can access it via indexer
    // @ts-ignore
    console.log("Access via indexer 7FE00010:", typeof rawDataset["7FE00010"]);

    const rawPixels = flattenPixelData(rawDataset);

    const results: TestResult[] = [];

    // 2. Iterate Configs
    for (const config of TRANSFER_SYNTAXES) {
        await executeTest(config, rawDataset, rawPixels, "WASM", results);

        if (config.name.startsWith("RLE")) {
            await executeTest(config, rawDataset, rawPixels, "JS", results);
        }
    }

    // 3. Report
    console.table(results);
    fs.writeFileSync(
        path.join(OUTPUT_DIR, "results.json"),
        JSON.stringify(results, null, 2)
    );
}

async function executeTest(
    config: { uid: string; name: string; quality: number },
    sourceDataset: DicomDataSet,
    rawPixels: Uint8Array,
    impl: "WASM" | "JS",
    results: TestResult[]
) {
    console.log(`\nTesting ${config.name} (${impl})...`);

    // Hack to force JS for RLE:
    if (config.name.startsWith("RLE")) {
        if (impl === "JS") {
            // @ts-ignore
            ZigCodecs.prototype._originalInitCodec =
                ZigCodecs.prototype.initCodec;
            ZigCodecs.prototype.initCodec = async () => {
                throw new Error("Forced JS");
            };
        } else {
            // Restore
            // @ts-ignore
            if (ZigCodecs.prototype._originalInitCodec) {
                // @ts-ignore
                ZigCodecs.prototype.initCodec =
                    ZigCodecs.prototype._originalInitCodec;
            }
        }
    }

    try {
        let encodedDataset: DicomDataSet | null = null;
        let p0 = 0,
            p1 = 0;

        // Standard Transcode Test (WASM / Default)
        p0 = performance.now();
        encodedDataset = await transcode(sourceDataset, {
            targetTransferSyntax: config.uid,
            quality: config.quality,
        });
        p1 = performance.now();
        const encodeTime = p1 - p0;

        const encodedBytes = write(encodedDataset, {
            transferSyntax: config.uid,
        });
        const encodedSize = encodedBytes.length;

        // Decode Verification (Round Trip)
        p0 = performance.now();
        const decodedDataset = await transcode(encodedDataset, {
            targetTransferSyntax: "1.2.840.10008.1.2.1",
        });
        p1 = performance.now();
        const decodeTime = p1 - p0;

        const decodedPixels = flattenPixelData(decodedDataset);

        const isLossy =
            config.name.includes("Lossy") ||
            config.name.includes("Baseline") ||
            config.name.includes("Extended");
        const tolerance = isLossy ? 25 : 0;

        const pass = compareBuffers(rawPixels, decodedPixels, tolerance);

        results.push({
            name: config.name,
            uid: config.uid,
            impl: impl,
            encodeTimeMs: encodeTime,
            decodeTimeMs: decodeTime,
            originalSize: rawPixels.byteLength,
            encodedSize: encodedSize,
            compressionRatio: (rawPixels.byteLength / encodedSize).toFixed(2),
            status: pass ? "PASS" : "FAIL",
        });
    } catch (e: any) {
        console.error(`Error testing ${config.name}:`, e.message);
        results.push({
            name: config.name,
            uid: config.uid,
            impl: impl,
            encodeTimeMs: 0,
            decodeTimeMs: 0,
            originalSize: 0,
            encodedSize: 0,
            compressionRatio: "0",
            status: "FAIL",
            error: e.message,
        });
    }
}

function flattenPixelData(dataset: DicomDataSet): Uint8Array {
    // @ts-ignore
    let pd = dataset["7FE00010"];

    // Fallback: check dict directly if indexer failed
    if (!pd && dataset.dict && dataset.dict["x7fe00010"]) {
        pd = dataset.dict["x7fe00010"].Value;
    }

    if (!pd) {
        throw new Error("No pixel data found in dataset (7FE00010)");
    }

    if (pd instanceof Uint8Array) {
        return pd;
    }

    if (Array.isArray(pd)) {
        const total = pd.reduce((acc, v) => acc + v.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const v of pd) {
            out.set(v, off);
            off += v.length;
        }
        return out;
    }

    throw new Error("Pixel Data format not recognized");
}

runTest().catch(console.error);
