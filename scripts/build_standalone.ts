import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

const DIST_DIR = resolve("dist");
const STANDALONE_DIR = join(DIST_DIR, "standalone");

// Ensure directories exist
if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR);
if (!existsSync(STANDALONE_DIR)) mkdirSync(STANDALONE_DIR);

// Utilities
function getWasmAsBase64(path: string): string {
    if (!existsSync(path)) {
        throw new Error(`WASM file not found at: ${path}`);
    }
    const buffer = readFileSync(path);
    return buffer.toString("base64");
}

async function buildCore() {
    console.log("Building Standalone Core...");
    const coreWasmPath = resolve("src/zig-core/zig-out/bin/rad-core.wasm");
    const wasmBase64 = getWasmAsBase64(coreWasmPath);

    await build({
        entryPoints: ["src/index-core.ts"],
        bundle: true,
        minify: true,
        format: "iife", // Browser compatible
        globalName: "radParserCore",
        outfile: join(STANDALONE_DIR, "rad-parser-core.min.js"),
        define: {
            __RAD_PARSER_CORE_WASM__: `"${wasmBase64}"`,
            "process.env.NODE_ENV": '"production"',
            __RAD_STANDALONE__: "true",
        },
        banner: {
            js: `// rad-parser core (standalone) - MIT License`,
        },
    });
}

async function buildCodecs() {
    console.log("Building Standalone Codecs...");
    const CODEC_NAMES = ["jpeg", "j2k", "jpegls", "rle", "htj2k", "ljpeg"];
    const defines: Record<string, string> = {
        "process.env.NODE_ENV": '"production"',
        __RAD_STANDALONE__: "true",
    };

    for (const codec of CODEC_NAMES) {
        const wasmPath = resolve(
            `src/zig-codecs/zig-out/bin/rad-codecs-${codec}.wasm`
        );
        // Some might not exist if not built, warn but continue?
        try {
            const b64 = getWasmAsBase64(wasmPath);
            defines[`__RAD_PARSER_CODEC_${codec.toUpperCase()}_WASM__`] =
                `"${b64}"`;
        } catch (e) {
            console.warn(`Skipping embedded WASM for ${codec}: ${e.message}`);
        }
    }

    await build({
        entryPoints: ["src/index-codecs.ts"],
        bundle: true,
        minify: true,
        format: "iife",
        globalName: "radParserCodecs",
        outfile: join(STANDALONE_DIR, "rad-parser-codecs.min.js"),
        define: defines,
        banner: {
            js: `// rad-parser codecs (standalone) - MIT License`,
        },
    });
}

async function buildDictionary() {
    console.log("Building Standalone Dictionary...");
    await build({
        entryPoints: ["src/dictionary-entry.ts"],
        bundle: true,
        minify: true,
        format: "iife",
        globalName: "radParserDictionary",
        outfile: join(STANDALONE_DIR, "rad-parser-dictionary.min.js"),
    });
}

async function main() {
    try {
        await buildCore();
        await buildCodecs();
        await buildDictionary();
        console.log("Standalone build complete.");
    } catch (e) {
        console.error("Build failed:", e);
        process.exit(1);
    }
}

main();
