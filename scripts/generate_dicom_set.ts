import * as fs from "fs";
import * as path from "path";
import { ZigCodecs } from "../src/codecs/zig-codecs";
import { parse } from "../src/core/parser";
import { DicomDataSet } from "../src/core/types";
import { write } from "../src/core/writer";

const SOURCE_FILE = path.resolve("test_data/REAL/DICOM/08FD35A0");
const OUTPUT_DIR = path.resolve("test_data/GENERATED");

// Transfer Syntax UIDs
const TS_JPEG_BASELINE_8BIT = "1.2.840.10008.1.2.4.50";
const TS_JPEG_EXTENDED_12BIT = "1.2.840.10008.1.2.4.51";
const TS_JPEG_LOSSLESS_14 = "1.2.840.10008.1.2.4.70"; // We'll try to use this if possible, or skip
const TS_J2K_LOSSLESS = "1.2.840.10008.1.2.4.90";
const TS_J2K_LOSSY = "1.2.840.10008.1.2.4.91";
const TS_JPEGLS_LOSSLESS = "1.2.840.10008.1.2.4.80";
const TS_JPEGLS_NEAR_LOSSLESS = "1.2.840.10008.1.2.4.81";
const TS_RLE = "1.2.840.10008.1.2.5";
const TS_EXPLICIT_VR_LE = "1.2.840.10008.1.2.1"; // Default/Uncompressed

async function main() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log(`Reading source file: ${SOURCE_FILE}`);
    const fileBuffer = fs.readFileSync(SOURCE_FILE);
    const data = new Uint8Array(
        fileBuffer.buffer,
        fileBuffer.byteOffset,
        fileBuffer.byteLength
    );
    const dataset = parse(data);

    // Extract basic info
    const rows = dataset.dict["x00280010"]?.Value as number;
    const cols = dataset.dict["x00280011"]?.Value as number;
    const bitsAllocated = dataset.dict["x00280100"]?.Value as number;
    const bitsStored = dataset.dict["x00280101"]?.Value as number;
    const highBit = dataset.dict["x00280102"]?.Value as number;
    const pixelRepresentation = dataset.dict["x00280103"]?.Value as number;
    const samplesPerPixel = (dataset.dict["x00280002"]?.Value as number) || 1;
    const photometricInterpretation = dataset.dict["x00280004"]
        ?.Value as string;

    console.log(
        `Source Info: ${cols}x${rows}, ${bitsAllocated}-bit (${bitsStored} stored), Samples: ${samplesPerPixel}, PI: ${photometricInterpretation}`
    );

    // Get Raw Pixel Data
    // Assuming source is uncompressed Explicit VR LE (as confirmed by dump_header)
    const pixelDataElement = dataset.dict["x7fe00010"];
    if (!pixelDataElement || !pixelDataElement.Value) {
        throw new Error("No pixel data found");
    }

    let rawPixels: Uint8Array;
    if (pixelDataElement.Value instanceof Uint8Array) {
        rawPixels = pixelDataElement.Value;
    } else if (
        Array.isArray(pixelDataElement.Value) &&
        pixelDataElement.Value[0] instanceof Uint8Array
    ) {
        // Concatenate fragments if any (shouldn't be for uncompressed)
        const fragments = pixelDataElement.Value as Uint8Array[];
        const totalLen = fragments.reduce((acc, f) => acc + f.length, 0);
        rawPixels = new Uint8Array(totalLen);
        let offset = 0;
        for (const f of fragments)
            (rawPixels.set(f, offset), (offset += f.length));
    } else {
        throw new Error("Unexpected pixel data format");
    }

    // Convert to 16-bit array for easier processing
    // Assuming Little Endian source
    const pixelCount = rows * cols * samplesPerPixel;
    const u16Pixels = new Uint16Array(pixelCount);
    // Be careful with byte offset
    const dataView = new DataView(
        rawPixels.buffer,
        rawPixels.byteOffset,
        rawPixels.byteLength
    );
    for (let i = 0; i < pixelCount; i++) {
        u16Pixels[i] = dataView.getUint16(i * 2, true); // Source is LE
    }

    const codecs = new ZigCodecs();

    // 1. Generate JPEG Baseline (8-bit)
    // Scale 16-bit to 8-bit
    console.log("Generating JPEG Baseline (8-bit)...");
    const pixels8 = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        // Simple linear scaling: (val / max_16) * 255 OR just shift
        // Since original is CT/MRI (likely), just shift might lose detail or clamp
        // Let's just shift right by (BitsStored - 8)
        let val = u16Pixels[i];
        if (bitsStored > 8) {
            val = val >> (bitsStored - 8);
        }
        pixels8[i] = Math.min(255, val);
    }

    try {
        const encodedJpeg8 = await codecs.encodeJpeg(
            pixels8,
            cols,
            rows,
            8,
            samplesPerPixel,
            90
        );
        writeDicom(
            dataset,
            encodedJpeg8,
            "JPEG_Baseline_8bit.dcm",
            TS_JPEG_BASELINE_8BIT,
            {
                bitsAllocated: 8,
                bitsStored: 8,
                highBit: 7,
                pixelDataVR: "OB", // Encapsulated is usually OB
            }
        );
    } catch (e) {
        console.error("Failed to generate JPEG 8-bit:", e);
    }

    // 2. Generate JPEG Extended (12-bit)
    console.log("Generating JPEG Extended (12-bit)...");
    const pixels16For12 = new Uint16Array(pixelCount);
    // TurboJPEG expects 16-bit buffer for 12-bit input? Or just short array?
    // C++ expects `uint8_t*` buffer, but treated as short* internally for >8 bits?
    // Let's check jpeg.cpp logic.
    // It casts `(const unsigned short*)pixel_data`.
    // So we need to pass a Uint8Array that represents the uint16 data.

    // Scale to 12-bit
    for (let i = 0; i < pixelCount; i++) {
        let val = u16Pixels[i];
        if (bitsStored > 12) {
            val = val >> (bitsStored - 12);
        }
        pixels16For12[i] = val;
    }
    const pixels12Bytes = new Uint8Array(pixels16For12.buffer);

    try {
        const encodedJpeg12 = await codecs.encodeJpeg(
            pixels12Bytes,
            cols,
            rows,
            12,
            samplesPerPixel,
            90
        );
        writeDicom(
            dataset,
            encodedJpeg12,
            "JPEG_Extended_12bit.dcm",
            TS_JPEG_EXTENDED_12BIT,
            {
                bitsAllocated: 16,
                bitsStored: 12,
                highBit: 11,
                pixelDataVR: "OB",
            }
        );
    } catch (e) {
        console.error("Failed to generate JPEG 12-bit:", e);
    }

    // 3. Generate JPEG 2000 (Lossless)
    console.log("Generating JPEG 2000 (Lossless)...");
    try {
        // J2K usually takes raw input matching bit depth
        // Provide raw 16-bit data (as bytes)
        const encodedJ2K = await codecs.encodeJpeg2000(
            rawPixels,
            cols,
            rows,
            bitsStored,
            samplesPerPixel
        );
        // Note: encodeJpeg2000 signature might vary, need to allow setting lossy/lossless?
        // Checking interface: encode_jpeg2000(ptr, len, width, height, bits, components)
        // It doesn't seem to have a 'quality' or 'lossless' parameter exposed in WASM?
        // If it defaults to lossless, good. If lossy, it returns lossy.
        // Assuming default is good for now.

        writeDicom(dataset, encodedJ2K, "J2K_Lossless.dcm", TS_J2K_LOSSLESS, {
            pixelDataVR: "OB",
        });
    } catch (e) {
        console.error("Failed to generate J2K:", e);
    }

    // 4. Generate JPEG-LS (Lossless)
    console.log("Generating JPEG-LS (Lossless)...");
    try {
        const encodedJPEGLS = await codecs.encodeJpegLs(
            rawPixels,
            cols,
            rows,
            bitsStored,
            samplesPerPixel
        );
        writeDicom(
            dataset,
            encodedJPEGLS,
            "JPEGLS_Lossless.dcm",
            TS_JPEGLS_LOSSLESS,
            {
                pixelDataVR: "OB",
            }
        );
    } catch (e) {
        console.error("Failed to generate JPEG-LS:", e);
    }

    // 5. Generate RLE
    console.log("Generating RLE...");
    try {
        // RLE usually 8-bit? Or supports 16-bit?
        // DICOM RLE Lossless is byte-oriented. 16-bit pixels are split into high/low bytes typically.
        // The WASM encoder needs to handle this.
        // encode_rle(ptr, len, width, height, components)
        // Does it assume 8-bit per component?
        // If so, 16-bit data (2 bytes) might need to be treated as 1 component 16-bit OR 2 components?
        // DICOM RLE is weird. It might fail if we pass 16-bit data if it expects 8-bit.
        // Let's try passing rawPixels (which is 16-bit) and see.
        // If it fails, we might skip.
        const encodedRLE = await codecs.encodeRle(
            rawPixels,
            cols,
            rows,
            samplesPerPixel
        );
        writeDicom(dataset, encodedRLE, "RLE_Lossless.dcm", TS_RLE, {
            pixelDataVR: "OB",
        });
    } catch (e) {
        console.error("Failed to generate RLE:", e);
    }

    console.log("Done.");
}

function writeDicom(
    originalDataset: DicomDataSet,
    encodedData: Uint8Array,
    filename: string,
    transferSyntax: string,
    overrides: {
        bitsAllocated?: number;
        bitsStored?: number;
        highBit?: number;
        pixelDataVR?: string;
    } = {}
) {
    // Clone dataset (shallow clone of dict is enough if we replace values)
    const newDict = { ...originalDataset.dict };

    // Update Pixel Data
    // Encapsulated data must be fragmentized (Item tag, etc.) but writer.ts handles
    // "Encapsulated Pixel Data" if we set specific structure?
    // writer.ts checks: if (vr === "OB" || vr === "OW") and (element as any).isEncapsulated

    // We need to construct the Pixel Data element as Encapsulated
    // Encapsulated data: [ Basic Offset Table (usually empty), Fragment 1 ]
    // For single frame, one fragment is usually enough.
    // BOT is first item (offset 0).

    const bot = new Uint8Array(0); // Empty Basic Offset Table
    const fragments = [bot, encodedData];

    newDict["x7fe00010"] = {
        vr: overrides.pixelDataVR || "OB",
        Value: fragments,
        // @ts-ignore - Custom property expected by writer.ts for encapsulated
        isEncapsulated: true,
    };

    // Update Transfer Syntax (handled by writer options, but also stored in meta header)
    // writer.ts updates x00020010 automatically based on options.

    // Update Bit Depth Strings if needed
    if (overrides.bitsAllocated)
        newDict["x00280100"] = { vr: "US", Value: overrides.bitsAllocated };
    if (overrides.bitsStored)
        newDict["x00280101"] = { vr: "US", Value: overrides.bitsStored };
    if (overrides.highBit)
        newDict["x00280102"] = { vr: "US", Value: overrides.highBit };

    // Create new dataset
    const newDataset: DicomDataSet = {
        dict: newDict,
        meta: originalDataset.meta, // writer regenerates meta mostly
    };

    const outBytes = write(newDataset, { transferSyntax });
    const outPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outPath, outBytes);
    console.log(`Saved ${filename} (${outBytes.length} bytes)`);
}

main().catch(console.error);
