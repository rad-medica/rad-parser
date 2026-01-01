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

    // ==================== JPEG ====================

    public async decodeJpeg(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpeg");
        // Rust returns Uint8Array (throws on error)
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
        return exports.encode_jpeg(pixels, width, height, components, quality);
    }

    // ==================== JPEG 2000 ====================

    public async decodeJpeg2000(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("j2k");
        return exports.decode_jpeg2000(data);
    }

    public async encodeJpeg2000(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number,
        lossless: boolean,
        quality?: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("j2k");
        return exports.encode_jpeg2000(pixels, width, height, bits, components, lossless, quality || 0.0);
    }

    // ==================== JPEG-LS ====================

    public async decodeJpegLs(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpegls");
        return exports.decode_jpegls(data);
    }

    public async encodeJpegLs(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpegls");
        return exports.encode_jpegls(pixels, width, height, bits, components);
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

    // ==================== HTJ2K ====================

    public async decodeHtj2k(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("htj2k");
        return exports.decode_htj2k(data);
    }

    // ==================== JPEG Lossless ====================

    public async decodeLjpeg(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("ljpeg");
        return exports.decode_ljpeg(data);
    }

    public unloadAll(): void {
        this.loader.unloadAll();
    }
}
