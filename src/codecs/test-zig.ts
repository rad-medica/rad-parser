/**
 * Test script for ZigCodecs with modular WASM codec loading.
 *
 * Each codec is loaded on demand, so no upfront init() is needed.
 */

import * as path from "path";
import * as url from "url";
import { ZigCodecs } from "./zig-codecs";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    // Set base path to the WASM output directory
    const wasmBasePath = path.resolve(__dirname, "../zig-codecs/zig-out/bin");

    console.log("Using WASM base path:", wasmBasePath);

    // Create codec instance with base path
    const codecs = new ZigCodecs(wasmBasePath);

    // Test data
    const width = 100;
    const height = 100;
    const components = 3;
    const pixels = new Uint8Array(width * height * components);

    // Fill with pattern
    for (let i = 0; i < pixels.length; i++) {
        pixels[i] = i % 255;
    }

    // Create some runs for RLE
    for (let i = 0; i < 100; i++) pixels[i] = 128;

    // ==================== RLE Test ====================
    console.log("\n=== Testing RLE ===");
    try {
        const rleEncoded = await codecs.encodeRle(
            pixels,
            width,
            height,
            components
        );
        console.log(
            `Encoded size: ${rleEncoded.length} (Original: ${pixels.length})`
        );

        const rleDecoded = await codecs.decodeRle(
            rleEncoded,
            width,
            height,
            components
        );
        console.log(`Decoded size: ${rleDecoded.length}`);

        if (rleDecoded.length !== pixels.length) {
            console.error("Size mismatch!");
            process.exit(1);
        }

        let matches = true;
        for (let i = 0; i < pixels.length; i++) {
            if (pixels[i] !== rleDecoded[i]) {
                console.error(
                    `Mismatch at ${i}: expected ${pixels[i]}, got ${rleDecoded[i]}`
                );
                matches = false;
                break;
            }
        }
        if (matches) {
            console.log("✓ RLE Passed");
        }
    } catch (e) {
        console.error("✗ RLE Test failed:", e);
    }

    // ==================== JPEG Test ====================
    console.log("\n=== Testing JPEG ===");
    try {
        const jpegEncoded = await codecs.encodeJpeg(
            pixels,
            width,
            height,
            8,
            3,
            90
        );
        console.log(`Encoded size: ${jpegEncoded.length}`);

        const jpegDecoded = await codecs.decodeJpeg(jpegEncoded);
        console.log(`Decoded size: ${jpegDecoded.length}`);

        if (jpegDecoded.length === width * height * 3) {
            console.log("✓ JPEG Passed (RGB output)");
        } else if (jpegDecoded.length === width * height * 4) {
            console.log("✓ JPEG Passed (RGBA output)");
        } else {
            console.warn(
                `⚠ JPEG Decoded size ${jpegDecoded.length} unexpected`
            );
        }
    } catch (e) {
        console.error("✗ JPEG Test failed:", e);
    }

    // ==================== JPEG 2000 Test ====================
    console.log("\n=== Testing JPEG 2000 ===");
    try {
        const j2kEncoded = await codecs.encodeJpeg2000(
            pixels,
            width,
            height,
            8,
            components
        );
        console.log(`Encoded size: ${j2kEncoded.length}`);

        const j2kDecoded = await codecs.decodeJpeg2000(j2kEncoded);
        console.log(`Decoded size: ${j2kDecoded.length}`);

        if (j2kDecoded.length === width * height * components) {
            console.log("✓ JPEG 2000 Passed");
        } else {
            console.warn(`⚠ J2K Decoded size ${j2kDecoded.length} unexpected`);
        }
    } catch (e) {
        console.error("✗ JPEG 2000 Test failed:", e);
    }

    // ==================== JPEG-LS Test ====================
    console.log("\n=== Testing JPEG-LS ===");
    try {
        const jpeglsEncoded = await codecs.encodeJpegLs(
            pixels,
            width,
            height,
            8,
            components
        );
        console.log(`Encoded size: ${jpeglsEncoded.length}`);

        const jpeglsDecoded = await codecs.decodeJpegLs(jpeglsEncoded);
        console.log(`Decoded size: ${jpeglsDecoded.length}`);

        if (jpeglsDecoded.length === width * height * components) {
            console.log("✓ JPEG-LS Passed");
        } else {
            console.warn(
                `⚠ JPEG-LS Decoded size ${jpeglsDecoded.length} unexpected`
            );
        }
    } catch (e) {
        console.error("✗ JPEG-LS Test failed:", e);
    }

    // Cleanup
    codecs.unloadAll();

    console.log("\n=== All tests completed ===");
}

main().catch(console.error);
