/**
 * Video Decoder Plugin (Adapter)
 * Supports MPEG-2, MPEG-4 AVC/H.264
 */

/**
 * Video Decoder Plugin (Adapter)
 * Supports MPEG-2, MPEG-4 AVC/H.264
 */

import { CodecContext, CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";

/**
 * External Decoder Interface
 * Expects a concatenated bitstream (e.g., MPEG-2, H.264 elementary stream).
 * Returns decoded raw pixel data (RGB/RGBA/Gray).
 */
export type ExternalVideoDecoder = (
    buffer: Uint8Array,
    context?: any
) => Promise<Uint8Array>;

/**
 * External Encoder Interface
 * Takes raw pixel data and encoding parameters.
 * Returns an array of fragments (e.g. frames or chunks).
 */
export type ExternalVideoEncoder = (
    pixelData: Uint8Array,
    transferSyntax: string,
    width: number,
    height: number,
    samples: number,
    bits: number
) => Promise<Uint8Array[]>;

export class VideoDecoder implements PixelDataCodec {
    name = "video-adapter";
    priority = 10; // Fallback
    codecInfo: CodecInfo = {
        multiFrame: true, // Video is typically multi-frame
    };

    /**
     * @param externalDecoder Function to decode video streams
     * @param externalEncoder Function to encode video streams
     */
    constructor(
        private externalDecoder?: ExternalVideoDecoder,
        private externalEncoder?: ExternalVideoEncoder
    ) {}

    canEncode(transferSyntax: string): boolean {
        // Assume symmetric support if encoder provided
        return !!this.externalEncoder && this.canDecode(transferSyntax);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        if (!this.externalEncoder)
            throw new Error(
                `Video encoder not configured for Transfer Syntax ${transferSyntax}`
            );

        try {
            return await this.externalEncoder(
                pixelData,
                transferSyntax,
                width,
                height,
                samples,
                bits
            );
        } catch (error) {
            throw new Error(
                `Video Encoding Failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    isSupported(): boolean {
        // Rely on injection for standard adapter pattern.
        return !!this.externalDecoder || !!this.externalEncoder;
    }

    canDecode(transferSyntax: string): boolean {
        return [
            "1.2.840.10008.1.2.4.100", // MPEG2 Main Profile @ Main Level
            "1.2.840.10008.1.2.4.101", // MPEG2 Main Profile @ High Level
            "1.2.840.10008.1.2.4.102", // MPEG-4 AVC/H.264 High Profile / Level 4.1
            "1.2.840.10008.1.2.4.103", // MPEG-4 AVC/H.264 BD-compatible High Profile / Level 4.1
            "1.2.840.10008.1.2.4.104", // MPEG-4 AVC/H.264 High Profile / Level 4.2 For 2D Video
            "1.2.840.10008.1.2.4.105", // MPEG-4 AVC/H.264 High Profile / Level 4.2 For 3D Video
            "1.2.840.10008.1.2.4.106", // MPEG-4 AVC/H.264 Stereo High Profile / Level 4.2
        ].includes(transferSyntax);
    }

    async decode(
        encodedBuffer: Uint8Array[],
        context: CodecContext
    ): Promise<Uint8Array> {
        if (!this.externalDecoder) {
            throw new Error(
                `Video decoder not configured for Transfer Syntax ${context.transferSyntax}`
            );
        }

        // Video frames are typically encapsulated differently.
        // The external decoder is expected to handle the full concatenated stream.
        const combined = concatFragments(encodedBuffer);

        try {
            return await this.externalDecoder(combined, context);
        } catch (error) {
            throw new Error(
                `Video Decoding Failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}
