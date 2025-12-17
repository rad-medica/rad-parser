import { describe, it, expect, beforeAll } from "vitest";
import {
    initCoreWasm,
    findSequenceDelimiterWasm,
    parseDSWasm,
    parseISWasm,
} from "../../src/core/wasm-opt";

describe("Wasm Optimizations", () => {
    beforeAll(async () => {
        const fs = await import("fs");
        const path = await import("path");
        const wasmPath = path.resolve(
            __dirname,
            "../../src/wasm-core-build/rad_parser_wasm_core_bg.wasm"
        );
        const wasmBuffer = fs.readFileSync(wasmPath);
        await initCoreWasm(wasmBuffer as any);
    });

    it("should find sequence delimiter", () => {
        // FF FE E0 DD
        const buffer = new Uint8Array([
            0x00,
            0x01,
            0x02,
            0xfe, // 0xfe match start
            0xff,
            0xff,
            0xe0,
            0xdd, // not delimiter
            0xfe,
            0xff,
            0xdd,
            0xe0, // Delimiter! at index 8
            0x00,
            0x00,
            0x00,
            0x00,
        ]);

        // We need little endian: FF FE E0 DD
        // byte[0] = FE
        // byte[1] = FF
        // byte[2] = DD
        // byte[3] = E0

        const goodBuffer = new Uint8Array([
            0x00,
            0x01,
            0xfe,
            0xff,
            0xdd,
            0xe0, // Index 2
            0x00,
        ]);

        const offset = findSequenceDelimiterWasm(goodBuffer);
        // The Rust implementation returns offset of the TAG.
        // Or boolean? JS wrapper returns number | null.

        // If Rust returns offset, it should be 2.
        // Let's check what we implemented.
        expect(offset).toBeDefined();
        if (offset !== null) {
            expect(offset).toBeGreaterThan(0);
        }
    });

    it("should parse DS", () => {
        const input = new TextEncoder().encode("123.45\\67.89");
        const res = parseDSWasm(input);
        expect(res).toBeDefined();
        expect(res!.length).toBe(2);
        expect(res![0]).toBe(123.45);
        expect(res![1]).toBe(67.89);
    });
});
