import { DicomDataSet } from "../core/types";
import { registry } from "../core/registry";
import { decodePixelData } from "../core/codec-helpers";
import { extractRescaledPixelData, extractPixelData } from './pixelDataExtractor';

export interface TranscodeOptions {
    targetTransferSyntax: string;
    quality?: number; // 0-100 for lossy
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

    // 1. Get Codecs
    const targetCodec = await registry.getEncoder(options.targetTransferSyntax);
    if (!targetCodec) {
        throw new Error(`Target Transfer Syntax ${options.targetTransferSyntax} not supported for encoding`);
    }

    if (!targetCodec.canEncode(options.targetTransferSyntax)) {
        throw new Error(`Codec ${targetCodec.name} implies support but cannot encode ${options.targetTransferSyntax}`);
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
    const frames = dataset.intString("x00280008") || 1; // "number" handles string/int conversion safely

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
            throw new Error(`Source Transfer Syntax ${currentTS} not supported`);
        }
        
        // This decodes the ENTIRE pixel data blob into one flat buffer (usually)
        // or we need frame-by-frame access.
        // Existing `decodePixelData` usually returns one flat buffer of all frames.
        const fullDecodedBuffer = await decodePixelData(dataset);
        
        // Split back into frames
        const frameSize = rows * columns * samples * (bits / 8); 
        // Note: bits/8 is byte size. If 12 bits stored as 16, it's 2 bytes.
        // Need 'bitsAllocated' specifically.
        
        if (fullDecodedBuffer.byteLength !== frameSize * frames) {
             console.warn(`Decoded buffer size ${fullDecodedBuffer.byteLength} != expected ${frameSize * frames}. Padding or mismatch?`);
        }
        
        for (let i = 0; i < frames; i++) {
            const start = i * frameSize;
            decodedFrames.push(fullDecodedBuffer.subarray(start, start + frameSize));
        }
    } else {
        // Native Data (OB/OW)
        const buffer = pixelDataInfo.Value;
        if (!(buffer instanceof Uint8Array)) {
             throw new Error("Pixel Data is not a Uint8Array. Type: " + typeof buffer);
        }
        
        const frameSize = Math.floor(rows * columns * samples * (bits / 8));
        
        if (frames > 1 && buffer.length >= frameSize) {
            for (let i = 0; i < frames; i++) {
                decodedFrames.push(buffer.slice(i * frameSize, (i + 1) * frameSize));
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
    for (const frame of decodedFrames) {
         const fragments = await targetCodec.encode(frame, options.targetTransferSyntax, columns, rows, samples, bits);
         if (!fragments) throw new Error("Codec returned undefined fragments");
         encodedFragments.push(...fragments);
    }
    
    // 4. Update Dataset
    // Update Transfer Syntax
    if (!dataset.dict['x00020010']) dataset.dict['x00020010'] = { vr: 'UI', Value: [] };
    dataset.dict['x00020010'].Value = [options.targetTransferSyntax];
    
    const isTargetNative = [
        "1.2.840.10008.1.2",
        "1.2.840.10008.1.2.1",
        "1.2.840.10008.1.2.2"
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
        
        dataset.dict["x7fe00010"] = {
            vr: bits > 8 ? "OW" : "OB", // Simple heuristic
            Value: flattened
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
            isEncapsulated: true 
        };
    }

    return dataset;
}
