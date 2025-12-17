import { beforeAll, describe, expect, it } from "vitest";
import {
    applyModalityLutWasm,
    applyVoiLutWasm,
    findSequenceDelimiterWasm,
    initCoreWasm,
} from "../../src/core/wasm-opt";

describe("WASM vs JS Core Functions", () => {
    beforeAll(async () => {
        await initCoreWasm();
    });

    describe("Sequence Delimiter", () => {
        it("should find delimiter correctly", () => {
            const size = 1000;
            const buffer = new Uint8Array(size);
            // Place delimiter at index 500
            buffer[500] = 0xfe;
            buffer[501] = 0xff;
            buffer[502] = 0xdd;
            buffer[503] = 0xe0;

            const offset = findSequenceDelimiterWasm(buffer);
            expect(offset).toBe(500);
        });

        it("should return null if not found", () => {
            const buffer = new Uint8Array(100);
            const offset = findSequenceDelimiterWasm(buffer);
            expect(offset).toBeNull();
        });
    });

    describe("Modality LUT", () => {
        it("should apply slope and intercept correctly (US)", () => {
            // Unsigned Short
            const input = new Uint8Array(new Uint16Array([10, 20, 30]).buffer);
            const slope = 2.0;
            const intercept = -5.0;

            const result = applyModalityLutWasm(input, slope, intercept, 16, 0);

            expect(result).not.toBeNull();
            expect(result![0]).toBe(10 * 2.0 - 5.0);
            expect(result![1]).toBe(20 * 2.0 - 5.0);
            expect(result![2]).toBe(30 * 2.0 - 5.0);
        });

        it("should apply slope and intercept correctly (SS)", () => {
            // Signed Short
            const input = new Uint8Array(new Int16Array([-10, 0, 10]).buffer);
            const slope = 1.5;
            const intercept = 0.0;

            const result = applyModalityLutWasm(input, slope, intercept, 16, 1);

            expect(result).not.toBeNull();
            expect(result![0]).toBe(-10 * 1.5);
            expect(result![1]).toBe(0);
            expect(result![2]).toBe(10 * 1.5);
        });
    });

    describe("VOI LUT", () => {
        it("should apply linear windowing", () => {
            // Input values: 0, 50, 100
            // WC=50, WW=100
            // Range: 0 (black) to 100 (white)
            // 0 -> <= 0 -> 0
            // 50 -> center -> 127/128 approx
            // 100 -> >= 100 -> 255
            const input = new Float32Array([0, 50, 100]);
            const wc = 50;
            const ww = 100;

            const result = applyVoiLutWasm(input, wc, ww);

            expect(result).not.toBeNull();
            expect(result![0]).toBe(0);
            // 50 is exactly mid: ((50-(50-0.5))/(99)+0.5)*255 = ((0.5)/99 + 0.5)*255... verify formula
            // Formula in C: ((val - (wc - 0.5)) / (ww - 1.0) + 0.5) * 255.0
            // ((50-49.5)/99 + 0.5) * 255 = (0.5/99 + 0.5) * 255 = 0.505 * 255 ~= 128
            expect(result![1]).toBeGreaterThan(120);
            expect(result![1]).toBeLessThan(135);
            expect(result![2]).toBe(255);
        });
    });
});
