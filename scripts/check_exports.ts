import { ZigWasmCodecLoader } from "../src/codecs/wasm-codecs-loader";

async function main() {
    try {
        const loader = ZigWasmCodecLoader.getInstance();
        console.log("Loading jpegls...");
        const codec = await loader.loadCodec("jpegls");
        console.log("Exports:", Object.keys(codec.exports));

        const ZigCodecs = (await import("../src/codecs/zig-codecs")).ZigCodecs;
        const codecs = new ZigCodecs();

        // ONLY TEST 16-bit - one call
        console.log("Encoding 4x4 16-bit image...");
        const width = 4;
        const height = 4;
        const pixels16 = new Uint16Array(width * height);
        for (let i = 0; i < pixels16.length; i++) pixels16[i] = 1000;
        const bytes16 = new Uint8Array(pixels16.buffer);
        console.log("Data size:", bytes16.length, "bytes");

        const encoded16 = await codecs.encodeJpegLs(
            bytes16,
            width,
            height,
            16,
            1
        );
        console.log("SUCCESS! Encoded 16-bit size:", encoded16.length);
    } catch (e) {
        console.error("Error:", e);
    }
}
main();
