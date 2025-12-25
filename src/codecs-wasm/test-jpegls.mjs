// Test script for Emscripten JPEG-LS codec
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    console.log("Loading Emscripten JPEG-LS module...");

    const modulePath = path.join(__dirname, "dist", "rad-codecs-jpegls.js");
    const moduleUrl = pathToFileURL(modulePath).href;
    const moduleExports = await import(moduleUrl);

    // Emscripten MODULARIZE exports as default export in ESM
    const RadCodecsJpegLs =
        moduleExports.default || moduleExports.RadCodecsJpegLs;

    // Initialize the module
    const Module = await RadCodecsJpegLs();
    console.log("Module loaded successfully!");

    // Get wrapped functions
    const encode_jpegls = Module.cwrap("encode_jpegls", "number", [
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
    ]);
    const free_encoded_data = Module.cwrap("free_encoded_data", null, [
        "number",
    ]);

    // Test 1: 4x4 16-bit image
    console.log("\nTest 1: Encoding 4x4 16-bit image...");
    const width = 4;
    const height = 4;
    const pixels16 = new Uint16Array(width * height);
    for (let i = 0; i < pixels16.length; i++) pixels16[i] = 1000;

    const bytes = new Uint8Array(pixels16.buffer);
    console.log(`  Input size: ${bytes.length} bytes`);

    // Allocate memory in WASM
    const ptr = Module._malloc(bytes.length);
    Module.HEAPU8.set(bytes, ptr);

    // Call encode
    const resultPtr = encode_jpegls(ptr, bytes.length, width, height, 16, 1);

    if (resultPtr === 0) {
        console.log("  ERROR: encode returned null pointer");
        Module._free(ptr);
        return;
    }

    // Read result struct (data_ptr, size, error, error_msg)
    const dataPtr = Module.getValue(resultPtr, "i32");
    const size = Module.getValue(resultPtr + 4, "i32");
    const error = Module.getValue(resultPtr + 8, "i32");

    console.log(`  Result: dataPtr=${dataPtr}, size=${size}, error=${error}`);

    if (error !== 0) {
        console.log("  Encoding failed with error:", error);
    } else {
        console.log(
            `  SUCCESS! Encoded ${width}x${height} 16-bit to ${size} bytes`
        );
    }

    // Cleanup
    free_encoded_data(resultPtr);
    Module._free(ptr);

    console.log("\nAll tests completed!");
}

main().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
