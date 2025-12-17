import { describe, expect, it, vi } from "vitest";
import { createDicomTransformer } from "../../src/core/transform";
import { write } from "../../src/core/writer";

// Helper to create a proper DICOM buffer (reused from streaming.test.ts)
function createDicomBuffer(): Uint8Array {
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

describe("DicomTransformStream", () => {
    it("should instantiate correctly", () => {
        const transformer = createDicomTransformer();
        expect(transformer).toHaveProperty("start");
        expect(transformer).toHaveProperty("transform");
        expect(transformer).toHaveProperty("flush");
    });

    it("should process chunks and emit elements", async () => {
        const elements: any[] = [];
        const controller = {
            enqueue: vi.fn(el => elements.push(el)),
            error: vi.fn(),
            terminate: vi.fn(),
            desiredSize: 0,
        };

        const transformer = createDicomTransformer();
        transformer.start(controller);

        const chunk = createDicomBuffer();

        transformer.transform(chunk, controller);
        transformer.flush(controller);

        expect(controller.enqueue).toHaveBeenCalled();
        console.log("Parsed elements:", JSON.stringify(elements, null, 2));
        expect(elements.length).toBeGreaterThan(0);

        // Find PN element: x00100010
        const patientNameRes = elements.find(
            el => el.dict && el.dict["x00100010"]
        );
        expect(patientNameRes).toBeDefined();

        const patientName = patientNameRes.dict["x00100010"];
        // parser normalizes to array
        const val = patientName?.Value?.[0];
        // Handle potential PN object or string
        if (typeof val === "string") {
            expect(val).toBe("Test^Patient");
        } else {
            expect((val as any).Alphanumeric).toBe("Test^Patient");
        }
    });

    it("should handle chunked data", () => {
        const elements: any[] = [];
        const controller = {
            enqueue: vi.fn(el => elements.push(el)),
            error: vi.fn(),
            terminate: vi.fn(),
            desiredSize: 0,
        };

        const transformer = createDicomTransformer();
        transformer.start(controller);

        const buffer = createDicomBuffer();

        // Split into small chunks
        const chunkSize = 20;
        for (let i = 0; i < buffer.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, buffer.length);
            transformer.transform(buffer.slice(i, end), controller);
        }

        transformer.flush(controller);

        expect(controller.enqueue).toHaveBeenCalled();
        const patientNameRes = elements.find(
            el => el.dict && el.dict["x00100010"]
        );
        expect(patientNameRes).toBeDefined();

        const patientName = patientNameRes.dict["x00100010"];
        const val = patientName?.Value?.[0];
        if (typeof val === "string") {
            expect(val).toBe("Test^Patient");
        } else {
            expect((val as any).Alphanumeric).toBe("Test^Patient");
        }
    });
});
