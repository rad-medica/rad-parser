import { describe, it, expect, vi } from "vitest";
import {
    StreamingParser,
    parseFromStream,
    parseFromAsyncIterator,
} from "../../src/core/streaming";
import { write } from "../../src/core/writer";
import { DicomElement } from "../../src/core/types";

// Helper to create a proper DICOM buffer
function createDicomBuffer(): Uint8Array {
    // Minimal DICOM dataset
    const dataset = {
        dict: {
            x00100010: { vr: "PN", Value: ["Test^Patient"] },
            x0020000d: { vr: "UI", Value: ["1.2.3.4"] },
        },
        meta: {
            x00020010: { vr: "UI", Value: ["1.2.840.10008.1.2.1"] }, // Explicit LE
        },
    } as any;
    return write(dataset);
}

describe("StreamingParser", () => {
    it("should parse a complete DICOM file in a single chunk", () => {
        const buffer = createDicomBuffer();
        const onElement = vi.fn((e) => {
            console.log("Test Received Element:", Object.keys(e.dict)[0]);
        });
        const onError = vi.fn((e) => {
            console.error("Test Received Error:", e);
        });
        const parser = new StreamingParser({ onElement, onError });

        parser.processChunk(buffer);
        parser.finalize();

        if (onError.mock.calls.length > 0) {
            console.error("Streaming Parser Error:", onError.mock.calls[0][0]);
        }

        // Expect at least PatientName and StudyInstanceUID
        expect(onElement).toHaveBeenCalled();
        const calls = onElement.mock.calls.map((c) => c[0]);
        const patientName = calls.find((c) => c.dict["x00100010"]);
        expect(patientName).toBeDefined();

        // PN is parsed into an object with components
        const nameVal = patientName?.dict["x00100010"].Value[0] as any;
        if (typeof nameVal === "string") {
            expect(nameVal).toBe("Test^Patient");
        } else {
            expect(nameVal.Alphanumeric).toBe("Test^Patient");
        }
    });

    it("should parse a DICOM file split into multiple small chunks", () => {
        const buffer = createDicomBuffer();
        const onElement = vi.fn((e) => {
            console.log("Multi-Chunk Received:", Object.keys(e.dict)[0]);
        });
        const onError = vi.fn((e) => console.error("Multi-Chunk Error:", e));
        const parser = new StreamingParser({ onElement, onError });

        // Split into 10-byte chunks
        const chunkSize = 10;
        for (let i = 0; i < buffer.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, buffer.length);
            console.log(`Processing chunk ${i}-${end}`);
            parser.processChunk(buffer.slice(i, end));
        }
        parser.finalize();

        expect(onElement).toHaveBeenCalled();
        const calls = onElement.mock.calls.map((c) => c[0]);
        const studyUid = calls.find((c) => c.dict["x0020000d"]);
        expect(studyUid).toBeDefined();
        expect(studyUid.dict["x0020000d"].Value[0]).toBe("1.2.3.4");
    });

    it("should handle split tags (cross-chunk boundary)", () => {
        const buffer = createDicomBuffer();
        const parser = new StreamingParser();
        const onElement = vi.fn();
        (parser as any).options.onElement = onElement;

        // Deliberately split at a problematic point (around 132 preamble+prefix)
        // DICM is at 128-132.
        const splitPoint = 130;
        parser.processChunk(buffer.slice(0, splitPoint));
        parser.processChunk(buffer.slice(splitPoint));
        parser.finalize();

        expect(onElement).toHaveBeenCalled();
    });

    it("should initialize correctly with options", () => {
        const onElement = vi.fn();
        const onError = vi.fn();
        const parser = new StreamingParser({
            onElement,
            onError,
            maxBufferSize: 100,
            maxIterations: 50,
        });
        // Check internal state (accessing private for test)
        expect((parser as any).options.maxBufferSize).toBe(100);
    });

    it("should throw if initialized twice", () => {
        const parser = new StreamingParser();
        parser.initialize(new Uint8Array(10));
        expect(() => parser.initialize(new Uint8Array(10))).toThrow(
            "Parser already initialized",
        );
    });

    it("should handle empty finalize gracefully", () => {
        const parser = new StreamingParser();
        // Should not throw, just return
        parser.finalize();
    });
});

describe("parseFromAsyncIterator", () => {
    it("should parse from an async generator", async () => {
        const buffer = createDicomBuffer();

        async function* chunkGenerator() {
            const chunkSize = 20;
            for (let i = 0; i < buffer.length; i += chunkSize) {
                yield buffer.slice(i, i + chunkSize);
                await new Promise((r) => setTimeout(r, 1)); // Simulate latency
            }
        }

        const onElement = vi.fn();
        await parseFromAsyncIterator(chunkGenerator(), { onElement });

        expect(onElement).toHaveBeenCalled();
        const receivedTags = onElement.mock.calls.map(
            (c) => Object.keys(c[0].dict)[0],
        );
        expect(receivedTags).toContain("x00100010");
    });

    it("should propagate errors from options.onError", async () => {
        async function* errorGen() {
            yield new Uint8Array(10);
            throw new Error("Stream failed");
        }

        const onError = vi.fn();
        await expect(
            parseFromAsyncIterator(errorGen(), { onError }),
        ).rejects.toThrow("Stream failed");
        // onError might not be called if the iterator itself throws, depends on implementation wrapper.
        // In current implementation, if iterator throws, it is caught in catch block and passed to onError.
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
});

// Since parseFromStream uses Web Streams API which is global in Node 18+ (verified in package.json target),
// we can test it directly if available, or mock it.
describe("parseFromStream", () => {
    if (typeof ReadableStream === "undefined") {
        console.warn(
            "ReadableStream not available, skipping parseFromStream tests",
        );
        return;
    }

    it("should parse a ReadableStream", async () => {
        const buffer = createDicomBuffer();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(buffer);
                controller.close();
            },
        });

        const onElement = vi.fn();
        await parseFromStream(stream, { onElement });
        expect(onElement).toHaveBeenCalled();
    });
});
