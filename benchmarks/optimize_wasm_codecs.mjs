import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const inDir = join(repoRoot, "src", "zig-codecs", "zig-out", "bin");
const outDir = join(repoRoot, "src", "zig-codecs", "zig-out", "bin-opt");

const mode = process.env.WASM_OPT_MODE ?? "-O2";
const extra = [
    "--strip-debug",
    "--strip-dwarf",
    "--enable-bulk-memory",
    "--enable-nontrapping-float-to-int",
];

function wasmOptBin() {
    // bun on Windows ensures binaries are in path.
    const name = process.platform === "win32" ? "wasm-opt.cmd" : "wasm-opt";
    return join(repoRoot, "node_modules", ".bin", name);
}

mkdirSync(outDir, { recursive: true });

const wasmFiles = readdirSync(inDir).filter(f => f.endsWith(".wasm"));
if (wasmFiles.length === 0) {
    console.error(`No .wasm files found in ${inDir}`);
    process.exit(1);
}

const bin = wasmOptBin();

if (!existsSync(bin)) {
    console.error(`wasm-opt not found at: ${bin}`);
    console.error("Did you run `bun install`?");
    process.exit(1);
}

let failed = false;
for (const file of wasmFiles) {
    const inFile = join(inDir, file);
    const outFile = join(outDir, file);

    const before = statSync(inFile).size;
    const args = [mode, ...extra, inFile, "-o", outFile];
    const res = spawnSync(bin, args, {
        stdio: "inherit",
        shell: process.platform === "win32",
    });
    if (res.error) {
        console.error(
            `${basename(file)}: failed to run wasm-opt: ${res.error.message}`
        );
        failed = true;
        continue;
    }
    if (res.status !== 0) {
        failed = true;
        continue;
    }
    const after = statSync(outFile).size;
    const delta = before - after;
    const pct = ((delta / before) * 100).toFixed(1);
    process.stdout.write(
        `${basename(file)}: ${before} -> ${after} bytes (${pct}% smaller)\n`
    );
}

process.exit(failed ? 1 : 0);
