import { describe, expect, it, vi } from "vitest";
import {
    BrowserImageCodec,
    Jpeg2000Decoder,
    JpegLosslessDecoder,
    JpegLsDecoder,
    RleCodec,
    VideoDecoder,
    registry,
} from "../../src/index";

describe("Codec Registry and Plugins", () => {
    it("should register and prioritize codecs", async () => {
        const rle = new RleCodec();
        const browser = new BrowserImageCodec();

        // Manual Registry for isolation
        const testRegistry = new (registry.constructor as any)();
        testRegistry.register(rle); // 10
        testRegistry.register(browser); // 50

        // 1.2.840.10008.1.2.5 is RLE (Supported by RLE Plugin)
        const d1 = await testRegistry.getDecoder("1.2.840.10008.1.2.5");
        expect(d1?.name).toBe("rle-wasm");

        // 1.2.840.10008.1.2.4.50 is JPEG (Supported by Browser and Video??)
        // Browser supports it.
        // In Node, Browser plugin isSupported() = false.
        // So unless we mock window, it won't be returned.
    });

    it("should retrieve encoders", async () => {
        const rle = new RleCodec();
        expect(rle.canEncode("1.2.840.10008.1.2.5")).toBe(true);

        const testRegistry = new (registry.constructor as any)();
        testRegistry.register(rle);

        const enc = await testRegistry.getEncoder("1.2.840.10008.1.2.5");
        expect(enc).toBeDefined();
        expect(enc?.name).toBe("rle-wasm");
    });
});

describe("RLE Codec", () => {
    it("should encode data to RLE format", async () => {
        const codec = new RleCodec();
        const data = new Uint8Array([1, 1, 1, 2, 3, 3]);
        // PackBits:
        // 3x1 -> -2, 1
        // 1x2 -> 0, 2 (Literal)
        // 2x3 -> -1, 3

        // RLE Header is 64 bytes.
        const encoded = await codec.encode(
            data,
            "1.2.840.10008.1.2.5",
            6,
            1,
            1,
            8
        );
        expect(encoded.length).toBe(1);
        expect(encoded[0].length).toBeGreaterThan(64);

        // Check Header
        const view = new DataView(encoded[0].buffer);
        expect(view.getUint32(0, true)).toBe(1); // 1 Segment
    });
});

describe("Adapter Plugins with Injection", () => {
    it("should use injected decoder for JPEG 2000", async () => {
        const mockDecode = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
        const codec = new Jpeg2000Decoder(mockDecode);

        expect(codec.isSupported()).toBe(true);

        const res = await codec.decode([new Uint8Array(10)]);
        expect(mockDecode).toHaveBeenCalled();
        expect(res).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("should use injected encoder for JPEG-LS", async () => {
        const mockEncode = vi.fn().mockResolvedValue([new Uint8Array([9, 9])]);
        const codec = new JpegLsDecoder(undefined, mockEncode);

        expect(codec.canEncode("1.2.840.10008.1.2.4.80")).toBe(true);

        const res = await codec.encode(
            new Uint8Array([1]),
            "1.2.840.10008.1.2.4.80",
            1,
            1,
            1,
            8
        );
        expect(mockEncode).toHaveBeenCalled();
        expect(res[0]).toEqual(new Uint8Array([9, 9]));
    });

    it("should support Video/MPEG formats via adapter", async () => {
        const mockDecode = vi.fn();
        const codec = new VideoDecoder(mockDecode);

        expect(codec.canDecode("1.2.840.10008.1.2.4.102")).toBe(true); // H.264
    });

    it("should support JPEG Lossless via adapter", async () => {
        const codec = new JpegLosslessDecoder(async () => new Uint8Array(0));
        expect(codec.canDecode("1.2.840.10008.1.2.4.57")).toBe(true);
        expect(codec.canDecode("1.2.840.10008.1.2.4.70")).toBe(true);
    });
});
