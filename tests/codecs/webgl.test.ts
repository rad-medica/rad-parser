import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebGlDecoder } from "../../src/codecs/webgl";

describe("WebGlDecoder", () => {
    let originalDocument: any;

    beforeEach(() => {
        try {
            originalDocument = global.document;
        } catch {}
    });

    afterEach(() => {
        global.document = originalDocument;
        vi.restoreAllMocks();
    });

    it("should report not supported if document is undefined (Node env)", async () => {
        // @ts-ignore
        delete global.document;
        const decoder = new WebGlDecoder();
        expect(await decoder.isSupported()).toBe(false);
    });

    it("should report supported if canvas and webgl2 are available", async () => {
        const mockContext = {};
        const mockCanvas = {
            getContext: vi.fn(type => (type === "webgl2" ? mockContext : null)),
        };

        global.document = {
            createElement: vi.fn(tag => (tag === "canvas" ? mockCanvas : null)),
        } as any;

        const decoder = new WebGlDecoder();
        expect(await decoder.isSupported()).toBe(true);
    });

    it("canDecode should return true for supported transfer syntaxes", async () => {
        const decoder = new WebGlDecoder();
        expect(await decoder.canDecode("1.2.840.10008.1.2.4.50")).toBe(true);
    });
});
