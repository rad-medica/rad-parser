/**
 * Vitest global setup: the WASM tests load the wasm-bindgen output from
 * dist/package (git-ignored). Fail early with instructions instead of a
 * cascade of "module not found" errors.
 */
import { existsSync } from "fs";
import { resolve } from "path";

const REQUIRED = [
    "dist/package/rad-core/rad_core_wasm_bg.wasm",
    "dist/package/rad-codecs-rle/rad_codecs_rle_bg.wasm",
    "dist/package/rad-codecs-jpegexp/rad_codecs_jpegexp_bg.wasm",
];

export default function setup(): void {
    const missing = REQUIRED.filter(
        p => !existsSync(resolve(__dirname, "../..", p))
    );
    if (missing.length > 0) {
        throw new Error(
            `WASM artifacts missing (${missing.join(", ")}). Build them first:\n` +
                "  rustup target add wasm32-unknown-unknown\n" +
                "  cargo install wasm-bindgen-cli --version <version of wasm-bindgen in Cargo.lock>\n" +
                "  bun run build:wasm"
        );
    }
}
