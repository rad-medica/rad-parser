/**
 * Test JPEG 2000 decode directly with WASM to isolate the issue
 */

import { ZigCodecs } from "../src/codecs/zig-codecs";

async function main() {
    console.log("Testing JPEG 2000 decode directly...\n");

    const zigCodecs = new ZigCodecs();
    await zigCodecs.initCodec("j2k");

    // Create a simple test: encode lossless, then try to decode
    const testPixels = new Uint8Array(128 * 128 * 2); // 16-bit, 128x128
    for (let i = 0; i < testPixels.length; i += 2) {
        const val = (i / 2) % 256;
        testPixels[i] = val;
        testPixels[i + 1] = (val >> 8) & 0xff;
    }

    console.log("Encoding test image (lossless)...");
    try {
        const encoded = await zigCodecs.encodeJpeg2000(
            testPixels,
            128,
            128,
            16,
            1,
            true, // lossless
            undefined
        );
        console.log(`✓ Encoded: ${encoded.length} bytes`);
        console.log(
            `First 20 bytes: ${Array.from(encoded.slice(0, 20))
                .map(b => `0x${b.toString(16).padStart(2, "0")}`)
                .join(" ")}`
        );

        console.log("\nAttempting decode...");
        console.log(`Encoded data length: ${encoded.length}`);

        // Try decode with detailed error handling
        try {
            const decoded = await zigCodecs.decodeJpeg2000(encoded);
            console.log(`✓ Decoded: ${decoded.length} bytes`);
            console.log(`Expected: ${testPixels.length} bytes`);

            if (decoded.length === testPixels.length) {
                let differences = 0;
                for (
                    let i = 0;
                    i < Math.min(decoded.length, testPixels.length);
                    i++
                ) {
                    if (decoded[i] !== testPixels[i]) {
                        differences++;
                        if (differences <= 10) {
                            console.log(
                                `Difference at ${i}: expected=0x${testPixels[i]!.toString(16)}, got=0x${decoded[i]!.toString(16)}`
                            );
                        }
                    }
                }
                console.log(`\nTotal differences: ${differences}`);
                if (differences === 0) {
                    console.log("✓ Perfect match!");
                }
            }
        } catch (e: any) {
            console.error(`✗ Decode failed: ${e.message || String(e)}`);
            if (e.stack) {
                console.error(e.stack);
            }
        }
    } catch (e: any) {
        console.error(`✗ Encode failed: ${e.message || String(e)}`);
        if (e.stack) {
            console.error(e.stack);
        }
    }
}

main().catch(console.error);
