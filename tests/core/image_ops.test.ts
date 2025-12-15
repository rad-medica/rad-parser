import { describe, it, expect, beforeAll } from "vitest";
import { initCoreWasm, applyModalityLutWasm, applyVoiLutWasm } from "../../src/core/wasm-opt";

describe("Wasm Image Operations", () => {
    beforeAll(async () => {
        const fs = await import("fs");
        const path = await import("path");
        const wasmPath = path.resolve(__dirname, "../../src/wasm-core-build/rad_parser_wasm_core_bg.wasm");
        const wasmBuffer = fs.readFileSync(wasmPath);
        await initCoreWasm(wasmBuffer as any);
    });

    it("should apply modality LUT (Rescale Slope/Intercept) for 8-bit", () => {
        const input = new Uint8Array([0, 10, 100, 255]);
        const slope = 2;
        const intercept = -10;
        // Expected: x * 2 - 10
        // 0 -> -10
        // 10 -> 10
        // 100 -> 190
        // 255 -> 500
        const res = applyModalityLutWasm(input, slope, intercept, 8, 0);
        expect(res).toBeDefined();
        expect(res!.length).toBe(4);
        expect(res![0]).toBe(-10);
        expect(res![1]).toBe(10);
        expect(res![2]).toBe(190);
        expect(res![3]).toBe(500);
    });

    it("should apply modality LUT for 16-bit (little endian)", () => {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setUint16(0, 0, true);   // 0
        view.setUint16(2, 1000, true); // 1000
        const input = new Uint8Array(buffer);
        
        const slope = 1;
        const intercept = 0;
        
        const res = applyModalityLutWasm(input, slope, intercept, 16, 0); // unsigned
        expect(res).toBeDefined();
        expect(res![0]).toBe(0);
        expect(res![1]).toBe(1000);
    });

    it("should apply VOI LUT (Window/Level)", () => {
        // Input float array
        const input = new Float32Array([-100, 0, 50, 100, 200]);
        // Window Center = 50, Window Width = 100
        // Lower = 50 - 50 = 0
        // Upper = 50 + 50 - 1 = 99
        // Range 0..99 maps to 0..255
        
        // -100 <= 0 -> 0
        // 0 -> 0
        // 50 -> Middle -> ~127
        // 100 > 99 -> 255
        // 200 > 99 -> 255
        
        const res = applyVoiLutWasm(input, 50, 100);
        expect(res).toBeDefined();
        expect(res![0]).toBe(0);
        expect(res![1]).toBe(0);
        expect(res![3]).toBe(255);
        expect(res![4]).toBe(255);
        
        const mid = res![2];
        expect(mid).toBeGreaterThan(120);
        expect(mid).toBeLessThan(135);
    });
});
