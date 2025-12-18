import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, resolve } from "path";

const SRC_ZIG_CORE = resolve("src/zig-core/zig-out/bin");
const SRC_ZIG_CODECS = resolve("src/zig-codecs/zig-out/bin");

const DIST_PKG_DIR = resolve("dist/package");
const DIST_WASM_CORE = join(DIST_PKG_DIR, "wasm-core");
const DIST_WASM_CODECS = join(DIST_PKG_DIR, "wasm-codecs");

// Helper to ensure dir exists
function ensureDir(dir: string) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function copyFiles(srcDir: string, destDir: string, pattern: RegExp) {
    if (!existsSync(srcDir)) {
        console.warn(`Source directory not found: ${srcDir}`);
        return;
    }

    ensureDir(destDir);

    const files = readdirSync(srcDir);
    let count = 0;
    for (const file of files) {
        if (pattern.test(file)) {
            copyFileSync(join(srcDir, file), join(destDir, file));
            count++;
        }
    }
    console.log(`Copied ${count} files from ${srcDir} to ${destDir}`);
}

async function main() {
    console.log("Copying WASM files for package distribution...");

    // Copy Core WASM
    copyFiles(SRC_ZIG_CORE, DIST_WASM_CORE, /\.wasm$/);

    // Copy Codec WASM
    copyFiles(SRC_ZIG_CODECS, DIST_WASM_CODECS, /\.wasm$/);

    console.log("WASM copy complete.");
}

main();
