/**
 * AutoDetect Codec Plugin
 * Acts as a Smart Delegator.
 * 1. Checks Registry for explicit TransferSyntax match.
 * 2. If explicit match fails/missing, sniffs the bitstream magic bytes.
 * 3. Delegates to the appropriate codec.
 */
import { CodecInfo, PixelDataCodec, registry } from "../core/registry";
// import { NodePngEncoder } from './png'; // Unused and causes bundling issues
// We import classes for instanceof checks or specific sniffing logic if needed,
// but mainly we use the registry to avoid circular deps.

export class AutoDetectCodec implements PixelDataCodec {
    name = "autodetect-smart";
    priority = 1000; // Highest Priority - Intercepts all calls
    codecInfo: CodecInfo = {
        multiFrame: true, // It accepts fragments and delegates, so it's multi-frame capable at this level
    };

    isSupported(): boolean {
        return true;
    }

    canDecode(ts: string): boolean {
        // We claim to handle everything, so we can supervise the decoding process
        return true;
    }

    canEncode(ts: string): boolean {
        return false; // Autodetect is for decoding primarily
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const transferSyntax = info?.transferSyntax || "";
        const all = registry.getCodecs();
        // console.log(`[AutoDetect] TS: ${transferSyntax}, Total Codecs: ${all.length}`);

        // 1. Try explicit registration first (standard path)
        const candidates = all.filter(
            c => c !== this && c.canDecode(transferSyntax)
        );
        // console.log(`[AutoDetect] Candidates: ${candidates.map(c=>c.name).join(', ')}`);

        if (candidates.length > 0) {
            // Try supported candidates
            for (const c of candidates) {
                if (c.isSupported()) {
                    try {
                        return await c.decode(encodedBuffer, info);
                    } catch (e) {
                        console.warn(
                            `[AutoDetect] Candidate ${c.name} failed: ${(e as Error).message}. Trying sniff...`
                        );
                    }
                }
            }
        }

        // 2. Sniffing Strategy (Fallback)
        // console.log(`[AutoDetect] Sniffing content...`);
        const firstByte = encodedBuffer[0]?.[0];
        const magic = encodedBuffer[0]?.slice(0, 4);

        // Check RLE (No explicit magic, but often begins with segments)
        // Check JPEG (FF D8)
        if (magic && magic[0] === 0xff && magic[1] === 0xd8) {
            // console.log(`[AutoDetect] Detected JPEG Magic Bytes.`);
            // Try registered JPEG codecs
            const jpgCodecs = registry
                .getCodecs()
                .filter(c => c.name.includes("jpeg") && c !== this);
            for (const c of jpgCodecs) {
                if (c.isSupported()) {
                    try {
                        return await c.decode(encodedBuffer, info);
                    } catch (e) {
                        /* continue */
                    }
                }
            }
        }

        // Check PNG (89 50 4E 47)
        if (magic && magic[0] === 0x89 && magic[1] === 0x50) {
            // console.log(`[AutoDetect] Detected PNG Magic Bytes.`);
            // We don't have a PNG Decoder yet (only encoder), so we can't do much.
        }

        throw new Error("AutoDetect: Could not determine or decode format.");
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        throw new Error("AutoDetect Encode not supported.");
    }
}
