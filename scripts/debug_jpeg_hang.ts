import * as fs from "fs";
import * as path from "path";
import { JpegNativeCodec } from "../src/codecs/jpegNative";
import { DicomDataSet } from "../src/core/types";
import { parse as parser } from "../src/index";
import { transcode } from "../src/utils/transcode";

async function run() {
    console.log("Starting debug script...");
    const INPUT_FILE = path.resolve(
        __dirname,
        "../test_data/TEST_STUDY/18CBDD76"
    );

    if (!fs.existsSync(INPUT_FILE)) {
        console.error("Input file not found!");
        process.exit(1);
    }

    const buffer = fs.readFileSync(INPUT_FILE);
    const data = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
    );
    const dataset = parser(data) as DicomDataSet;

    console.log("Transcoding to Native...");
    const rawDataset = await transcode(dataset, {
        targetTransferSyntax: "1.2.840.10008.1.2.1",
    });
    console.log("Native transcode done.");

    // Extract raw pixels (simplified extraction)
    // @ts-ignore
    let rawPixels = rawDataset.dict["x7fe00010"].Value;
    if (Array.isArray(rawPixels)) {
        const total = rawPixels.reduce((acc, v) => acc + v.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const v of rawPixels) {
            out.set(v, off);
            off += v.length;
        }
        rawPixels = out;
    }

    const width = rawDataset.uint16("x00280011") || 0;
    const height = rawDataset.uint16("x00280010") || 0;
    const bits = rawDataset.uint16("x00280100") || 8;
    const samples = rawDataset.uint16("x00280002") || 1;

    console.log(
        `Image info: ${width}x${height}, bits=${bits}, samples=${samples}, size=${rawPixels.length}`
    );

    // Manually test JpegNativeCodec
    console.log("Initializing JpegNativeCodec...");
    const codec = new JpegNativeCodec();
    // @ts-ignore
    await codec.initWasm();

    console.log("Encoding...");
    try {
        // Downscale logic check
        let pixelsToEncode = rawPixels as Uint8Array;
        let bitsToEncode = bits;
        if (bits > 8) {
            console.log("Downscaling manually...");
            const src = new Uint16Array(
                pixelsToEncode.buffer,
                pixelsToEncode.byteOffset,
                pixelsToEncode.byteLength / 2
            );
            const dst = new Uint8Array(src.length);
            const shift = bits - 8;
            for (let i = 0; i < src.length; i++) {
                dst[i] = src[i] >> shift;
            }
            pixelsToEncode = dst;
            bitsToEncode = 8;
        }

        const start = performance.now();
        const encoded = await codec.encode(
            pixelsToEncode,
            "1.2.840.10008.1.2.4.50",
            width,
            height,
            samples,
            bitsToEncode,
            90
        );
        const end = performance.now();
        console.log(
            `Encoding success! Time: ${(end - start).toFixed(2)}ms, Size: ${encoded[0].length}`
        );
    } catch (e: any) {
        console.error("Encoding failed message:", e.message);
        console.error("Encoding failed stack:", e.stack);
    }
}

run().catch(console.error);
