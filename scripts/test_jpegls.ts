import { ZigCodecs } from "../src/codecs/zig-codecs";

async function main() {
    const codecs = new ZigCodecs();
    await codecs.initCodec("jpegls");

    const width = 128;
    const height = 128;
    const components = 1;
    const bits = 8;
    const samples = 1;

    // Create synthetic 8-bit gradient
    const pixels = new Uint8Array(width * height);
    for (let i = 0; i < pixels.length; i++) {
        pixels[i] = i % 256;
    }
    const buffer = pixels;

    console.log(`Encoding synthetic ${width}x${height} 8-bit image...`);
    try {
        const encoded = await codecs.encodeJpegLs(
            buffer,
            width,
            height,
            bits,
            samples
        );
        console.log(`Success! Encoded size: ${encoded.length}`);
    } catch (e: any) {
        console.error("Encoding FAILED:", e);
    }
}

main();
