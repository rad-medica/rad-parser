/**
 * WASM Optimization Wrappers
 *
 * Provides WASM-accelerated parsing functions for DICOM VRs.
 * Falls back to JavaScript if WASM is not available.
 */

import { ZigCoreLoader } from "./wasm-core-loader";

let isWasmInitialized = false;
let coreExports: Record<string, unknown> | null = null;
let coreMemory: WebAssembly.Memory | null = null;
const loader = ZigCoreLoader.getInstance();

/**
 * Initialize the Core Wasm module (optional but recommended for performance).
 * If not called, the parser will fall back to pure JavaScript.
 */
export async function initCoreWasm(): Promise<void> {
    if (isWasmInitialized) return;

    try {
        const module = await loader.load();
        coreExports = module.exports;
        coreMemory = module.memory;
        isWasmInitialized = true;
    } catch (e) {
        console.warn("Core WASM module not available, using JS fallback:", e);
    }
}

function writeToMemory(data: Uint8Array): number {
    if (!coreExports || !coreMemory) throw new Error("WASM not initialized");
    const alloc = coreExports.alloc as (size: number) => number;
    const ptr = alloc(data.length);
    const mem = new Uint8Array(coreMemory.buffer);
    mem.set(data, ptr);
    return ptr;
}

function freeMemory(ptr: number, size: number): void {
    if (!coreExports) return;
    const free_ptr = coreExports.free_ptr as (
        ptr: number,
        size: number,
    ) => void;
    free_ptr(ptr, size);
}

export function parseDSWasm(input: Uint8Array): Float64Array | null {
    if (!isWasmInitialized || !coreExports) return null;
    try {
        const ptr = writeToMemory(input);
        const parse_ds = coreExports.parse_ds as (
            ptr: number,
            len: number,
        ) => number;
        const get_ds_value = coreExports.get_ds_value as (
            index: number,
        ) => number;

        const count = parse_ds(ptr, input.length);
        freeMemory(ptr, input.length);

        if (count <= 0) return null;

        const result = new Float64Array(count);
        for (let i = 0; i < count; i++) {
            result[i] = get_ds_value(i);
        }
        return result;
    } catch {
        return null;
    }
}

export function parseISWasm(input: Uint8Array): Int32Array | null {
    if (!isWasmInitialized || !coreExports) return null;
    try {
        const ptr = writeToMemory(input);
        const parse_is = coreExports.parse_is as (
            ptr: number,
            len: number,
        ) => number;
        const get_is_value = coreExports.get_is_value as (
            index: number,
        ) => number;

        const count = parse_is(ptr, input.length);
        freeMemory(ptr, input.length);

        if (count <= 0) return null;

        const result = new Int32Array(count);
        for (let i = 0; i < count; i++) {
            result[i] = get_is_value(i);
        }
        return result;
    } catch {
        return null;
    }
}

export function parsePNWasm(_value: string): unknown | null {
    // Person Name parsing not yet migrated
    return null;
}

export function parseDAWasm(value: string): string | null {
    if (!isWasmInitialized || !coreExports || !coreMemory) return null;
    try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        const ptr = writeToMemory(bytes);

        const parse_date = coreExports.parse_date as (
            ptr: number,
            len: number,
        ) => number;
        const resultPtr = parse_date(ptr, bytes.length);
        freeMemory(ptr, bytes.length);

        if (!resultPtr) return null;

        // Read result string
        const mem = new Uint8Array(coreMemory.buffer);
        let end = resultPtr;
        while (mem[end] !== 0 && end < mem.length) end++;

        const decoder = new TextDecoder();
        return decoder.decode(mem.slice(resultPtr, end));
    } catch {
        return null;
    }
}

export function parseTMWasm(value: string): string | null {
    if (!isWasmInitialized || !coreExports || !coreMemory) return null;
    try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        const ptr = writeToMemory(bytes);

        const parse_time = coreExports.parse_time as (
            ptr: number,
            len: number,
        ) => number;
        const resultPtr = parse_time(ptr, bytes.length);
        freeMemory(ptr, bytes.length);

        if (!resultPtr) return null;

        const mem = new Uint8Array(coreMemory.buffer);
        let end = resultPtr;
        while (mem[end] !== 0 && end < mem.length) end++;

        const decoder = new TextDecoder();
        return decoder.decode(mem.slice(resultPtr, end));
    } catch {
        return null;
    }
}

export function findSequenceDelimiterWasm(_input: Uint8Array): number | null {
    // Not migrated yet
    return null;
}

export function applyModalityLutWasm(
    pixelData: Uint8Array,
    slope: number,
    intercept: number,
    bitsAllocated: number,
    pixelRepresentation: number,
): Float32Array | null {
    if (!isWasmInitialized || !coreExports || !coreMemory) return null;
    try {
        const ptr = writeToMemory(pixelData);

        const apply_modality_lut = coreExports.apply_modality_lut as (
            ptr: number,
            len: number,
            slope: number,
            intercept: number,
            bits: number,
            repr: number,
        ) => number;
        const get_result_ptr = coreExports.get_result_ptr as () => number;
        const get_result_len = coreExports.get_result_len as () => number;

        const res = apply_modality_lut(
            ptr,
            pixelData.length,
            slope,
            intercept,
            bitsAllocated,
            pixelRepresentation,
        );
        freeMemory(ptr, pixelData.length);

        if (res !== 0) return null;

        const outPtr = get_result_ptr();
        const outLen = get_result_len();

        const numFloats = outLen / 4;
        const result = new Float32Array(numFloats);
        const floatView = new Float32Array(
            coreMemory.buffer,
            outPtr,
            numFloats,
        );
        result.set(floatView);

        freeMemory(outPtr, outLen);
        return result;
    } catch {
        return null;
    }
}

export function applyVoiLutWasm(
    input: Float32Array,
    windowCenter: number,
    windowWidth: number,
): Uint8Array | null {
    if (!isWasmInitialized || !coreExports || !coreMemory) return null;
    try {
        const byteLen = input.length * 4;
        const alloc = coreExports.alloc as (size: number) => number;
        const ptr = alloc(byteLen);
        const floatView = new Float32Array(
            coreMemory.buffer,
            ptr,
            input.length,
        );
        floatView.set(input);

        const apply_voi_lut = coreExports.apply_voi_lut as (
            ptr: number,
            len: number,
            wc: number,
            ww: number,
        ) => number;
        const get_result_ptr = coreExports.get_result_ptr as () => number;
        const get_result_len = coreExports.get_result_len as () => number;

        const res = apply_voi_lut(ptr, input.length, windowCenter, windowWidth);
        freeMemory(ptr, byteLen);

        if (res !== 0) return null;

        const outPtr = get_result_ptr();
        const outLen = get_result_len();

        const result = new Uint8Array(outLen);
        const mem = new Uint8Array(coreMemory.buffer);
        result.set(mem.slice(outPtr, outPtr + outLen));

        freeMemory(outPtr, outLen);
        return result;
    } catch {
        return null;
    }
}
