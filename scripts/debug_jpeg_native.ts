import { ZigWasmCodecLoader } from "../src/codecs/wasm-codecs-loader";

async function main() {
    console.log("Loading jpeg codec...");
    const loader = ZigWasmCodecLoader.getInstance();
    const module = await loader.loadCodec("jpeg");
    const exports = module.exports as any;

    if (!exports.encode_jpeg) {
        console.error("encode_jpeg not found!");
        return;
    }

    console.log("Testing encode_jpeg...");

    // Test Case 1: Minimal 8x8 8-bit grayscale
    // 8*8 = 64 bytes
    const width = 8;
    const height = 8;
    const bits = 8;
    const components = 1;
    const len = width * height * components;
    const pixels = new Uint8Array(len).fill(128); // Grey

    const ptr = exports.alloc(len);
    const mem = new Uint8Array(module.exports.memory.buffer);
    mem.set(pixels, ptr);

    console.log("Calling with 6 args (ptr, len, w, h, b, c)...");
    try {
        const res = exports.encode_jpeg(
            ptr,
            len,
            width,
            height,
            bits,
            components
        );
        console.log("Result:", res);
        if (res === 0) {
            const outPtr = exports.get_result_ptr();
            const outLen = exports.get_result_len();
            console.log(`Success! Output size: ${outLen}`);
        }
    } catch (e) {
        console.error("6 args failed:", e);
    }

    console.log("\n--- Permutation Testing ---");
    const testW = 16;
    const testH = 16;

    for (const c of [1, 3, 4]) {
        for (const bitsParam of [8, 16, 0, 1]) {
        // The 'bitsParam' loop is no longer relevant for the new signature,
        // but we keep it to ensure the outer loop structure remains.
        // The new signature uses 'components' and 'quality'.
        for (const bitsParam of [8, 16, 0, 1]) {
            const len = testW * testH * c * (bitsParam > 8 ? 2 : 1); // rough guess, just needs enough mem
            const ptr = exports.alloc(len * 2); // Allocate extra safety
            const pix = new Uint8Array(len * 2).fill(128); // Grey
            const mem = new Uint8Array(module.exports.memory.buffer);
            mem.set(pix, ptr);

            // Test standard 6 args: ptr, len, w, h, components, quality
            try {
                    len,
                    testW,
                    testH,
                    stride,
                    c
                );
                if (resB === 0)
                    console.log(
                        `SUCCESS! [6 args-stride] w=${testW} h=${testH} stride=${stride} c=${c}`
                    );
            } catch (e) {
                // ignore crashes
            }
        }
    }

    console.log("Testing Signatures...");

    // Test 5 args: ptr, w, h, c, q
    try {
        const ptr = exports.alloc(width * height * 3);
        const res = exports.encode_jpeg(ptr, width, height, 3, 90);
        console.log(`Sig [ptr, w, h, c, q] (5 args) -> ${res}`);
    } catch (e) {}

    // Test 6 args: ptr, w, h, b, c, q
    try {
        const ptr = exports.alloc(width * height * 3);
        const res = exports.encode_jpeg(ptr, width, height, 8, 3, 90);
        console.log(`Sig [ptr, w, h, b, c, q] (6 args) -> ${res}`);
    } catch (e) {}

    // Test 6 args: ptr, len, w, h, c, q (No bits)
    try {
        const len = width * height * 3;
        const ptr = exports.alloc(len);
        const res = exports.encode_jpeg(ptr, len, width, height, 3, 90);
        console.log(`Sig [ptr, len, w, h, c, q] (6 args) -> ${res}`);
    } catch (e) {}

    // Test 7 args: ptr, len, w, h, b, c, q -> WE KNOW THIS CRASHES (Unreachable)

    console.log("Testing 5 args...");
    try {
        const ptr = exports.alloc(64);
        exports.encode_jpeg(ptr, 64, 8, 8, 1); // ptr, len, w, h, c?
    } catch (e) {
        console.log("5 args crashed");
    }
}

main();
