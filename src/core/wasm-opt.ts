import init, {
    parse_ds,
    parse_is,
    apply_modality_lut,
    apply_voi_lut,
} from "../wasm-core-build/rad_parser_wasm_core";

let isWasmInitialized = false;
let wasmExports: any = null;

/**
 * Initialize the Core Wasm module (optional but recommended for performance).
 * If not called, the parser will fall back to pure JavaScript.
 */
export function initCoreWasm(
    module_or_path?: string | Request | URL,
): Promise<unknown> {
    return init(module_or_path).then(async (res) => {
        isWasmInitialized = true;
        // Store reference to wasm module exports
        try {
            wasmExports = await import("../wasm-core-build/rad_parser_wasm_core");
        } catch {
            // Module loaded via init already
        }
        return res;
    });
}

/**
 * Wasm Optimization Wrappers
 *
 * Safe wrappers that attempt to use Wasm for parsing if available.
 * If Wasm is not initialized, these return null, signaling the caller
 * to use the JavaScript fallback.
 */

export function parseDSWasm(input: Uint8Array): Float64Array | null {
    if (!isWasmInitialized) return null;
    try {
        return parse_ds(input);
    } catch (e) {
        return null; // Fallback to JS
    }
}

export function parseISWasm(input: Uint8Array): Int32Array | null {
    if (!isWasmInitialized) return null;
    try {
        return parse_is(input);
    } catch (e) {
        return null; // Fallback to JS
    }
}

export function parsePNWasm(value: string): any | null {
    if (!isWasmInitialized || !wasmExports?.parse_person_name) return null;
    try {
        return wasmExports.parse_person_name(value);
    } catch {
        return null;
    }
}

export function parseDAWasm(value: string): string | null {
    if (!isWasmInitialized || !wasmExports?.parse_date) return null;
    try {
        return wasmExports.parse_date(value);
    } catch {
        return null;
    }
}

export function parseTMWasm(value: string): string | null {
    if (!isWasmInitialized || !wasmExports?.parse_time) return null;
    try {
        return wasmExports.parse_time(value);
    } catch {
        return null;
    }
}

export function findSequenceDelimiterWasm(input: Uint8Array): number | null {
    if (!isWasmInitialized || !wasmExports?.find_sequence_delimiter) return null;
    try {
        return wasmExports.find_sequence_delimiter(input);
    } catch {
        return null; // Fallback to JS
    }
}

export function applyModalityLutWasm(
    pixelData: Uint8Array,
    slope: number,
    intercept: number,
    bitsAllocated: number,
    pixelRepresentation: number,
): Float32Array | null {
    if (!isWasmInitialized || !wasmExports?.apply_modality_lut) return null;
    try {
        return wasmExports.apply_modality_lut(
            pixelData,
            slope,
            intercept,
            bitsAllocated,
            pixelRepresentation,
        );
    } catch {
        return null; // Fallback to JS
    }
}

export function applyVoiLutWasm(
    input: Float32Array,
    windowCenter: number,
    windowWidth: number,
): Uint8Array | null {
    if (!isWasmInitialized || !wasmExports?.apply_voi_lut) return null;
    try {
        return wasmExports.apply_voi_lut(input, windowCenter, windowWidth);
    } catch {
        return null; // Fallback to JS
    }
}
