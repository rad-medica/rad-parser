/**
 * Benchmark for WASM vs JS specific operations
 *
 * Focuses on:
 * 1. Sequence Delimiter Finding
 * 2. Modality LUT Application
 * 3. VOI LUT Application
 */

import { performance } from "perf_hooks";
import {
    applyModalityLutWasm,
    applyVoiLutWasm,
    findSequenceDelimiterWasm,
    initCoreWasm,
} from "../src/core/wasm-opt.js";

// JS Implementations for comparison
function findSequenceDelimiterJS(data: Uint8Array): number | null {
    const len = data.length;
    if (len < 8) return null;
    let i = 0;
    while (i < len - 4) {
        if (
            data[i] === 0xfe &&
            data[i + 1] === 0xff &&
            data[i + 2] === 0xdd &&
            data[i + 3] === 0xe0
        ) {
            return i;
        }
        i++;
    }
    return null;
}

function applyModalityLutJS(
    pixelData: Uint8Array,
    slope: number,
    intercept: number,
    bitsAllocated: number,
    pixelRepresentation: number
): Float32Array {
    const numPixels =
        bitsAllocated > 8 ? pixelData.length / 2 : pixelData.length;
    const result = new Float32Array(numPixels);

    if (bitsAllocated === 8) {
        for (let i = 0; i < numPixels; i++) {
            result[i] = pixelData[i] * slope + intercept;
        }
    } else if (bitsAllocated === 16) {
        const view = new DataView(
            pixelData.buffer,
            pixelData.byteOffset,
            pixelData.byteLength
        );
        const isSigned = pixelRepresentation === 1;
        for (let i = 0; i < numPixels; i++) {
            const val = isSigned
                ? view.getInt16(i * 2, true)
                : view.getUint16(i * 2, true);
            result[i] = val * slope + intercept;
        }
    }
    return result;
}

function applyVoiLutJS(
    input: Float32Array,
    wc: number,
    ww: number
): Uint8Array {
    const len = input.length;
    const result = new Uint8Array(len);

    if (ww < 1) ww = 1;
    const center05 = wc - 0.5;
    const width1 = ww - 1.0;
    const min = center05 - width1 / 2.0;
    const max = center05 + width1 / 2.0;

    for (let i = 0; i < len; i++) {
        const val = input[i];
        if (val <= min) {
            result[i] = 0;
        } else if (val > max) {
            result[i] = 255;
        } else {
            result[i] = Math.round(((val - center05) / width1 + 0.5) * 255.0);
        }
    }
    return result;
}

async function benchmark() {
    console.log("Initializing WASM...");
    await initCoreWasm();
    console.log("WASM Initialized.\n");

    const iterations = 100;

    // 1. Sequence Delimiter
    console.log("--- Find Sequence Delimiter (10MB Buffer) ---");
    const bufSize = 10 * 1024 * 1024;
    const buffer = new Uint8Array(bufSize);
    // Place delimiter at the end
    buffer[bufSize - 4] = 0xfe;
    buffer[bufSize - 3] = 0xff;
    buffer[bufSize - 2] = 0xdd;
    buffer[bufSize - 1] = 0xe0;

    let start = performance.now();
    for (let i = 0; i < iterations; i++) findSequenceDelimiterJS(buffer);
    let jsTime = performance.now() - start;

    start = performance.now();
    for (let i = 0; i < iterations; i++) findSequenceDelimiterWasm(buffer);
    let wasmTime = performance.now() - start;

    console.log(
        `JS Total: ${jsTime.toFixed(2)}ms, Avg: ${(jsTime / iterations).toFixed(2)}ms`
    );
    console.log(
        `WASM Total: ${wasmTime.toFixed(2)}ms, Avg: ${(wasmTime / iterations).toFixed(2)}ms`
    );
    console.log(`Speedup: ${(jsTime / wasmTime).toFixed(2)}x\n`);

    // 2. Modality LUT
    console.log("--- Apply Modality LUT (512x512, 16-bit) ---");
    const width = 512;
    const height = 512;
    const numPixels = width * height;
    const pixelData = new Uint8Array(numPixels * 2); // 16-bit
    const view = new DataView(pixelData.buffer);
    for (let i = 0; i < numPixels; i++) view.setUint16(i * 2, i % 65535, true); // Little endian

    start = performance.now();
    for (let i = 0; i < iterations; i++)
        applyModalityLutJS(pixelData, 1.0, -1024, 16, 0);
    jsTime = performance.now() - start;

    start = performance.now();
    for (let i = 0; i < iterations; i++)
        applyModalityLutWasm(pixelData, 1.0, -1024, 16, 0);
    wasmTime = performance.now() - start;

    console.log(
        `JS Total: ${jsTime.toFixed(2)}ms, Avg: ${(jsTime / iterations).toFixed(2)}ms`
    );
    console.log(
        `WASM Total: ${wasmTime.toFixed(2)}ms, Avg: ${(wasmTime / iterations).toFixed(2)}ms`
    );
    console.log(`Speedup: ${(jsTime / wasmTime).toFixed(2)}x\n`);

    // 3. VOI LUT
    console.log("--- Apply VOI LUT (512x512 Float32) ---");
    const inputFloat = new Float32Array(numPixels);
    for (let i = 0; i < numPixels; i++) inputFloat[i] = i - 1024; // Simulated HU

    start = performance.now();
    for (let i = 0; i < iterations; i++) applyVoiLutJS(inputFloat, 40, 400);
    jsTime = performance.now() - start;

    start = performance.now();
    for (let i = 0; i < iterations; i++) applyVoiLutWasm(inputFloat, 40, 400);
    wasmTime = performance.now() - start;

    console.log(
        `JS Total: ${jsTime.toFixed(2)}ms, Avg: ${(jsTime / iterations).toFixed(2)}ms`
    );
    console.log(
        `WASM Total: ${wasmTime.toFixed(2)}ms, Avg: ${(wasmTime / iterations).toFixed(2)}ms`
    );
    console.log(`Speedup: ${(jsTime / wasmTime).toFixed(2)}x\n`);
}

benchmark().catch(console.error);
