/**
 * WASM Optimization Wrappers
 *
 * Provides WASM-accelerated parsing functions via wasm-bindgen.
 */

import { ZigCoreLoader } from "./wasm-core-loader";

let isWasmInitialized = false;
let coreExports: any = null;
const loader = ZigCoreLoader.getInstance();

export async function initCoreWasm(): Promise<void> {
    if (isWasmInitialized) return;
    try {
        const module = await loader.load();
        coreExports = module.exports;
        isWasmInitialized = true;
    } catch (e) {
        console.warn("Core WASM module not available:", e);
    }
}

export function resetWasmMemory(): void {
    // wasm-bindgen manages memory. No manual reset needed usually.
    // If we wanted to "reset", we'd need to re-instantiate, which is expensive.
    // We assume bindgen frees temporary memory.
}

export function parseDSWasm(input: Uint8Array): Float64Array | null {
    if (!isWasmInitialized) return null;
    try {
        return coreExports.parse_ds(input);
    } catch {
        return null;
    }
}

export function parseISWasm(input: Uint8Array): Int32Array | null {
    if (!isWasmInitialized) return null;
    try {
        return coreExports.parse_is(input);
    } catch {
        return null;
    }
}

export function parsePNWasm(_value: string): unknown | null {
    // Not exposed via bindgen yet in a usable way for JS string input?
    // Rust parse_pn takes bytes.
    return null;
}

export function parseDAWasm(value: string): string | null {
    if (!isWasmInitialized) return null;
    try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        return coreExports.parse_date(bytes);
    } catch {
        return null;
    }
}

export function parseTMWasm(value: string): string | null {
    if (!isWasmInitialized) return null;
    try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        return coreExports.parse_time(bytes);
    } catch {
        return null;
    }
}

export function findSequenceDelimiterWasm(input: Uint8Array): number | null {
    if (!isWasmInitialized) return null;
    try {
        const res = coreExports.find_sequence_delimiter(input);
        return res === -1 ? null : res;
    } catch {
        return null;
    }
}

export function applyModalityLutWasm(
    pixelData: Uint8Array,
    slope: number,
    intercept: number,
    bitsAllocated: number,
    pixelRepresentation: number
): Float32Array | null {
    if (!isWasmInitialized) return null;
    try {
        return coreExports.apply_modality_lut(pixelData, slope, intercept, bitsAllocated, pixelRepresentation);
    } catch {
        return null;
    }
}

export function applyVoiLutWasm(
    input: Float32Array,
    windowCenter: number,
    windowWidth: number
): Uint8Array | null {
    if (!isWasmInitialized) return null;
    try {
        return coreExports.apply_voi_lut(input, windowCenter, windowWidth);
    } catch {
        return null;
    }
}
