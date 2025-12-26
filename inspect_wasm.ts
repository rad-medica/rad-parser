import { readFile } from "fs/promises";
import { resolve } from "path";

async function main() {
    const wasmPath = resolve("src/core-wasm/dist/rad-core.wasm");
    console.log(`Inspecting: ${wasmPath}`);

    try {
        const buffer = await readFile(wasmPath);
        const module = await WebAssembly.compile(buffer);
        console.log("Exports:");
        const exports = WebAssembly.Module.exports(module);
        exports.forEach(e => console.log(` - ${e.name} (${e.kind})`));
    } catch (e) {
        console.error("Error loading WASM:", e);
    }
}

main();
