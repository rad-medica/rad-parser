import { build } from "esbuild";
import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const DIST_DIR = resolve("dist");
const STANDALONE_DIR = join(DIST_DIR, "standalone");

// Ensure directories exist
if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR);
if (!existsSync(STANDALONE_DIR)) mkdirSync(STANDALONE_DIR);

async function buildCore() {
    console.log("Building Standalone Core...");
    await build({
        entryPoints: ["src/index-core.ts"],
        bundle: true,
        minify: true,
        format: "iife", // Browser compatible
        globalName: "radParserCore",
        outfile: join(STANDALONE_DIR, "rad-parser-core.min.js"),
        define: {
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
    await build({
        entryPoints: ["src/index-codecs.ts"],
        bundle: true,
        minify: true,
        format: "iife",
        globalName: "radParserCodecs",
        outfile: join(STANDALONE_DIR, "rad-parser-codecs.min.js"),
        define: {
            "process.env.NODE_ENV": '"production"',
            __RAD_STANDALONE__: "true",
        },
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
