/**
 * Compare lossy vs lossless JPEG 2000 to understand the decode issue
 */

import { ZigCodecs } from "../src/codecs/zig-codecs";

async function main() {
    console.log("Comparing JPEG 2000 Lossy vs Lossless...\n");

    const zigCodecs = new ZigCodecs();
    await zigCodecs.initCodec("j2k");

    // Create test pixels
    const testPixels = new Uint8Array(128 * 128 * 2); // 16-bit, 128x128
    for (let i = 0; i < testPixels.length; i += 2) {
        const val = (i / 2) % 256;
        testPixels[i] = val;
        testPixels[i + 1] = (val >> 8) & 0xff;
    }

    console.log("Test image: 128x128, 16-bit\n");

    // Test Lossy
    console.log("=".repeat(60));
    console.log("Testing LOSSY encoding/decoding...");
    console.log("=".repeat(60));
    try {
        const encodedLossy = await zigCodecs.encodeJpeg2000(
            testPixels,
            128,
            128,
            16,
            1,
            false, // lossy
            90 // quality
        );
        console.log(`✓ Lossy encoded: ${encodedLossy.length} bytes`);
        console.log(
            `First 20 bytes: ${Array.from(encodedLossy.slice(0, 20))
                .map(b => `0x${b.toString(16).padStart(2, "0")}`)
                .join(" ")}`
        );

        const decodedLossy = await zigCodecs.decodeJpeg2000(encodedLossy);
        console.log(`✓ Lossy decoded: ${decodedLossy.length} bytes`);
        console.log(`Expected: ${testPixels.length} bytes\n`);
    } catch (e: any) {
        console.error(`✗ Lossy failed: ${e.message || String(e)}\n`);
    }

    // Test Lossless
    console.log("=".repeat(60));
    console.log("Testing LOSSLESS encoding/decoding...");
    console.log("=".repeat(60));
    try {
        const encodedLossless = await zigCodecs.encodeJpeg2000(
            testPixels,
            128,
            128,
            16,
            1,
            true, // lossless
            undefined
        );
        console.log(`✓ Lossless encoded: ${encodedLossless.length} bytes`);
        console.log(
            `First 20 bytes: ${Array.from(encodedLossless.slice(0, 20))
                .map(b => `0x${b.toString(16).padStart(2, "0")}`)
                .join(" ")}`
        );

        console.log("\nAttempting lossless decode...");
        const decodedLossless = await zigCodecs.decodeJpeg2000(encodedLossless);
        console.log(`✓ Lossless decoded: ${decodedLossless.length} bytes`);
        console.log(`Expected: ${testPixels.length} bytes\n`);
    } catch (e: any) {
        console.error(`✗ Lossless decode failed: ${e.message || String(e)}`);
        if (e.stack) {
            console.error(e.stack);
        }
    }
}

main().catch(console.error);
