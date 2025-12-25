import { decodePixelData } from "../core/codec-helpers";
import { registry } from "../core/registry";
import { DicomDataSet } from "../core/types";
import { extractPixelData } from "./pixelDataExtractor";

export interface TranscodeOptions {
    targetTransferSyntax: string;
    quality?: number; // 0-100 for lossy. For J2K, 0=lossless, >0=ratio (e.g. 20 for 20:1)
}

/**
 * Transcodes a DICOM dataset to a new Transfer Syntax.
 * Decodes existing pixel data (if compressed) and re-encodes it.
 * Updates TransferSyntaxUID and PixelData tags.
 */
export async function transcode(
    dataset: DicomDataSet,
    options: TranscodeOptions
): Promise<DicomDataSet> {
    const currentTS = dataset.string("x00020010");
    if (!currentTS) {
        throw new Error("Missing Transfer Syntax UID");
    }

    if (currentTS === options.targetTransferSyntax) {
        return dataset; // No-op
    }

    // Handle uncompressed formats (they don't need codecs, just format conversion)
    const uncompressedFormats = [
        "1.2.840.10008.1.2", // Implicit VR Little Endian
        "1.2.840.10008.1.2.1", // Explicit VR Little Endian
        "1.2.840.10008.1.2.2", // Explicit VR Big Endian
    ];

    if (
        uncompressedFormats.includes(options.targetTransferSyntax) &&
        uncompressedFormats.includes(currentTS)
    ) {
        // For Native -> Native, just update the Transfer Syntax UID
        // The writer will handle the endianness conversion
        if (!dataset.dict["x00020010"]) {
            dataset.dict["x00020010"] = { vr: "UI", Value: [] };
        }
        dataset.dict["x00020010"].Value = [options.targetTransferSyntax];
        return dataset;
    }

    // 1. Get Codecs for compressed formats
    const targetCodec = await registry.getEncoder(options.targetTransferSyntax);
    if (!targetCodec) {
        throw new Error(
            `Target Transfer Syntax ${options.targetTransferSyntax} not supported for encoding`
        );
    }

    if (
        targetCodec.canEncode &&
        !targetCodec.canEncode(options.targetTransferSyntax)
    ) {
        throw new Error(
            `Codec ${targetCodec.name} implies support but cannot encode ${options.targetTransferSyntax}`
        );
    }

    // 2. Extract & Decode Original Pixel Data
    // extractPixelData returns info wrapper, we need raw buffer or decoded frame(s)
    const pixelDataInfo = extractPixelData(dataset);
    if (!pixelDataInfo) {
        throw new Error("No Pixel Data found in dataset");
    }

    // Use high-level helper to get raw frames
    // If it's single frame, returns 1 buffer. If multi, loop.
    // We need to handle multi-frame logic manually here to re-encode each frame.

    const rows = dataset.uint16("x00280010") || 0;
    const columns = dataset.uint16("x00280011") || 0;
    const samples = dataset.uint16("x00280002") || 1;
    const bits = dataset.uint16("x00280100") || 8;
    const bitsStored = dataset.uint16("x00280101") || bits;
    const pixelRepresentation = dataset.uint16("x00280103") || 0;
    console.log(
        `[DEBUG] Transcode: Bits=${bits}, Stored=${bitsStored}, Rep=${pixelRepresentation}, Rows=${rows}, Cols=${columns}`
    );
    const frames = dataset.intString?.("x00280008") || 1; // "number" handles string/int conversion safely

    // Decode all frames
    const decodedFrames: Uint8Array[] = [];

    // Check if we can decode the source
    // If source is compressed, we decode. If native, we just read bytes.
    // The helpers usually handle "Native" TS automatically.

    // For simplicity, let's use a specialized decode-all approach
    // We can assume `decodePixelData` works on the whole blob for encapsulated,
    // but for Transcoding we strictly want a list of Raw Frames.

    // TODO: Optimize for streaming/memory. For now, load all in RAM.

    if (pixelDataInfo.isEncapsulated) {
        // Encapsulated data usually matches frames, but could be fragmented differently.
        // We rely on the Codec registry to decode the source blob.
        const sourceCodec = await registry.getDecoder(currentTS);
        if (!sourceCodec) {
            throw new Error(
                `Source Transfer Syntax ${currentTS} not supported`
            );
        }

        // This decodes the ENTIRE pixel data blob into one flat buffer (usually)
        // or we need frame-by-frame access.
        const fragments = pixelDataInfo.fragmentArrays || [
            pixelDataInfo.Value as Uint8Array,
        ];
        const fullDecodedBuffer = await decodePixelData(currentTS, fragments, {
            rows,
            columns,
            samplesPerPixel: samples,
            bitsAllocated: bits,
        });

        // Split back into frames
        const frameSize = rows * columns * samples * (bits / 8);
        // Note: bits/8 is byte size. If 12 bits stored as 16, it's 2 bytes.
        // Need 'bitsAllocated' specifically.

        if (fullDecodedBuffer.byteLength !== frameSize * frames) {
            console.warn(
                `Decoded buffer size ${fullDecodedBuffer.byteLength} != expected ${frameSize * frames}. Padding or mismatch?`
            );
        }

        for (let i = 0; i < frames; i++) {
            const start = i * frameSize;
            decodedFrames.push(
                fullDecodedBuffer.subarray(start, start + frameSize)
            );
        }
    } else {
        // Native Data (OB/OW)
        const buffer = pixelDataInfo.Value;
        if (!(buffer instanceof Uint8Array)) {
            throw new Error(
                "Pixel Data is not a Uint8Array. Type: " + typeof buffer
            );
        }

        const frameSize = Math.floor(rows * columns * samples * (bits / 8));

        if (frames > 1 && buffer.length >= frameSize) {
            for (let i = 0; i < frames; i++) {
                decodedFrames.push(
                    buffer.slice(i * frameSize, (i + 1) * frameSize)
                );
            }
        } else {
            decodedFrames.push(buffer);
        }
    }

    if (decodedFrames.length === 0) {
        throw new Error("Failed to extract frames");
    }

    // 3. Encode to Target Syntax
    const encodedFragments: Uint8Array[] = [];
    const isJpegBaseline =
        options.targetTransferSyntax === "1.2.840.10008.1.2.4.50";

    for (const frame of decodedFrames) {
        let frameToEncode = frame;
        let bitsToEncode = bits;

        // Handle Signed Data (Shift to Unsigned)
        // JPEG-LS and others generally expect Unsigned data.
        if (pixelRepresentation === 1 && bits > 8) {
            // Assume 16-bit container for >8 bit data
            const src = new Int16Array(
                frame.buffer,
                frame.byteOffset,
                frame.byteLength / 2
            );
            const dst = new Uint16Array(src.length);
            // Shift by 2^(BitsStored-1)
            const shift = 1 << (bitsStored - 1);
            let minVal = 32767;
            let maxVal = -32768;
            for (let i = 0; i < src.length; i++) {
                const val = src[i]!;
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
                dst[i] = val + shift;
            }
            console.log(
                `[DEBUG] Signed Shift: Min=${minVal}, Max=${maxVal}, Shift=${shift}`
            );
            frameToEncode = new Uint8Array(dst.buffer);
            // We successfully converted to unsigned
        }

        // Downscale 16-bit to 8-bit for JPEG Baseline if needed
        if (isJpegBaseline && bits > 8) {
            console.warn("Downscaling >8-bit data to 8-bit for JPEG Baseline");
            if (frameToEncode.byteLength % 2 !== 0)
                throw new Error("16-bit frame length must be even");
            const src = new Uint16Array(
                frameToEncode.buffer,
                frameToEncode.byteOffset,
                frameToEncode.byteLength / 2
            );
            const dst = new Uint8Array(src.length);
            // Simple linear scaling: val >> (bits - 8)
            const shift = bits - 8;
            for (let i = 0; i < src.length; i++) {
                dst[i] = src[i]! >> shift;
            }
            frameToEncode = dst;
            bitsToEncode = 8;
        }

        const fragments = await targetCodec.encode!(
            frameToEncode,
            options.targetTransferSyntax,
            columns,
            rows,
            samples,
            bitsToEncode,
            options.quality // Pass quality if available
        );
        if (!fragments) throw new Error("Codec returned undefined fragments");
        encodedFragments.push(...fragments);
    }

    // 4. Update Dataset
    // Update Transfer Syntax
    if (!dataset.dict["x00020010"])
        dataset.dict["x00020010"] = { vr: "UI", Value: [] };
    dataset.dict["x00020010"].Value = [options.targetTransferSyntax];

    // Update Pixel Representation to 0 (Unsigned) if we shifted
    if (pixelRepresentation === 1 && bits > 8) {
        if (!dataset.dict["x00280103"])
            dataset.dict["x00280103"] = { vr: "US", Value: [0] };
        else dataset.dict["x00280103"].Value = [0];
    }

    const isTargetNative = [
        "1.2.840.10008.1.2",
        "1.2.840.10008.1.2.1",
        "1.2.840.10008.1.2.2",
    ].includes(options.targetTransferSyntax);

    // Update Pixel Data (7FE0,0010)
    if (isTargetNative) {
        // Flatten fragments into one buffer
        const totalSize = encodedFragments.reduce((a, b) => a + b.length, 0);
        const flattened = new Uint8Array(totalSize);
        let offset = 0;
        for (const frag of encodedFragments) {
            flattened.set(frag, offset);
            offset += frag.length;
        }

        // For Big Endian, the writer will handle byte-swapping when writing
        // Don't byte-swap here - keep data in Little Endian format (native JS format)
        // The writer will byte-swap when serializing if needed
        dataset.dict["x7fe00010"] = {
            vr:
                options.targetTransferSyntax === "1.2.840.10008.1.2.4.50"
                    ? "OB"
                    : bits > 8
                      ? "OW"
                      : "OB",
            Value: flattened,
        };
    } else {
        // Encapsulated Format
        // Structure: [Basic Offset Table (Item), Fragment 1 (Item), Fragment 2 (Item)...]
        // writer.ts needs "OB" but expects a Sequence-like Array<Uint8Array> to write Items if isEncapsulated is set (or implicitly).

        // Add BOT
        const bot = new Uint8Array(0); // Empty BOT
        const fragmentsWithOffsetTable = [bot, ...encodedFragments];

        dataset.dict["x7fe00010"] = {
            vr: "OB",
            Value: fragmentsWithOffsetTable,
            isEncapsulated: true,
        };
    }

    return dataset;
}
