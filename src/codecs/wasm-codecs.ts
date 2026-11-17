/**
 * WasmCodecs - High-level API for DICOM image codec operations.
 */

import { CodecType, ZigWasmCodecLoader } from "./wasm-codecs-loader";

export class WasmCodecs {
    private loader: ZigWasmCodecLoader;
    private basePath?: string;

    constructor(basePath?: string) {
        this.loader = ZigWasmCodecLoader.getInstance();
        this.basePath = basePath;
        if (basePath) {
            this.loader.setBasePath(basePath);
        }
    }

    public async initCodec(codec: CodecType): Promise<void> {
        await this.loader.loadCodec(codec);
    }

    public static getCodecForTransferSyntax(transferSyntaxUid: string): CodecType | null {
        return ZigWasmCodecLoader.getCodecForTransferSyntax(transferSyntaxUid);
    }

    private async getCodecExports(codec: CodecType): Promise<any> {
        const module = await this.loader.loadCodec(codec);
        return module.exports;
    }

    // ==================== JPEG 1 (jpegexp-rs) ====================
    // Decoders return interleaved samples: one byte each up to 8 bits, little-endian
    // 16-bit words above. Encoders take the same layout.

    public async decodeJpeg(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpeg");
        return exports.decode_jpeg(data);
    }

    public async encodeJpeg(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number,
        quality: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpeg");
        return exports.rad_encode_jpeg(pixels, width, height, bits, components, quality, 0);
    }

    /** JPEG Lossless, Process 14 (SOF3). `predictor` is the selection value, 1-7. */
    public async encodeLjpeg(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number,
        predictor: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("ljpeg");
        return exports.rad_encode_jpeg(pixels, width, height, bits, components, 100, predictor);
    }

    // ==================== JPEG 2000 / HTJ2K (jpegexp-rs) ====================

    public async decodeJpeg2000(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("j2k");
        return exports.decode_j2k(data);
    }

    /**
     * @param quality Lossy only: 1-99, defaults to 90. Ignored when `lossless`.
     * @param htj2k Use High-Throughput block coding (HTJ2K).
     */
    public async encodeJpeg2000(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number,
        lossless: boolean,
        quality: number = 90,
        htj2k: boolean = false
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports(htj2k ? "htj2k" : "j2k");
        return exports.rad_encode_j2k(
            pixels,
            width,
            height,
            bits,
            components,
            lossless,
            lossless ? 100 : quality,
            htj2k
        );
    }

    // ==================== JPEG-LS (jpegexp-rs) ====================

    public async decodeJpegLs(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpegls");
        return exports.decode_jpegls(data);
    }

    /** Lossless JPEG-LS (NEAR = 0), valid for both .80 and .81 transfer syntaxes. */
    public async encodeJpegLs(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpegls");
        return exports.rad_encode_jpegls(pixels, width, height, bits, components);
    }

    // ==================== RLE ====================

    public async decodeRle(
        data: Uint8Array,
        width: number,
        height: number,
        components: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("rle");
        return exports.decode_rle(data, width, height, components);
    }

    public async encodeRle(
        pixels: Uint8Array,
        width: number,
        height: number,
        components: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("rle");
        return exports.encode_rle(pixels, width, height, components);
    }

    // ==================== HTJ2K (jpegexp-rs) ====================

    public async decodeHtj2k(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("htj2k");
        return exports.decode_j2k(data);
    }

    // ==================== JPEG Lossless, Process 14 (jpegexp-rs) ====================

    public async decodeLjpeg(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("ljpeg");
        return exports.decode_jpeg(data);
    }

    public unloadAll(): void {
        this.loader.unloadAll();
    }
}
