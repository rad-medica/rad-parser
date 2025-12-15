/**
 * Video Decoder Plugin (Adapter)
 * Supports MPEG-2, MPEG-4 AVC/H.264
 */

/**
 * Video Decoder Plugin (Adapter)
 * Supports MPEG-2, MPEG-4 AVC/H.264
 */

import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";

export class VideoDecoder implements PixelDataCodec {
    name = "video-adapter";
    priority = 10; // Fallback
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    constructor(
        private externalDecoder?: (buffer: Uint8Array) => Promise<Uint8Array>,
        private externalEncoder?: (
            pixelData: Uint8Array,
            ts: string,
            w: number,
            h: number,
            s: number,
            b: number,
        ) => Promise<Uint8Array[]>,
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
        bits: number,
    ): Promise<Uint8Array[]> {
        if (!this.externalEncoder)
            throw new Error("Video encoder not configured.");
        return this.externalEncoder(
            pixelData,
            transferSyntax,
            width,
            height,
            samples,
            bits,
        );
    }

    isSupported(): boolean {
        // Rely on injection for standard adapter pattern.
        return !!this.externalDecoder;
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

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        if (!this.externalDecoder) {
            throw new Error("Video decoder not configured.");
        }

        // Video frames are typically encapsulated differently.
        // The external decoder is expected to handle the full concatenated stream.
        const combined = concatFragments(encodedBuffer);

        return this.externalDecoder(combined);
    }
}
