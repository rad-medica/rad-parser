import { ZigWasmCodecLoader } from "../src/codecs/wasm-codecs-loader";

async function main() {
    const loader = ZigWasmCodecLoader.getInstance();
    // Assuming running from root, ensure base path is correct could be implicit
    // But usually scripts need help finding the public dir if it relies on fetch or fs
    // The loader in node uses fs.readFileSync

    const codecsToInspect = ["jpeg", "j2k", "jpegls", "rle"];

    console.log("Inspecting WASM Exports...");

    for (const codec of codecsToInspect) {
        try {
            const module = await loader.loadCodec(codec as any);
            console.log(`\n=== ${codec} exports ===`);
            const exports = Object.keys(module.exports);
            exports.forEach(e => console.log(e));
        } catch (error) {
            console.error(`Failed to load ${codec}:`, error);
        }
    }
}

main();
