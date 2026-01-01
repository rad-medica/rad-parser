/**
 * WASM Core Loader - Loads the core WebAssembly module for DICOM parsing utilities.
 * Uses wasm-bindgen generated artifacts.
 */

// Define the shape of the exports we expect (subset)
interface CoreExports {
    parse_is: (input: Uint8Array) => Int32Array;
    parse_ds: (input: Uint8Array) => Float64Array;
    parse_date: (input: Uint8Array) => string;
    parse_time: (input: Uint8Array) => string;
    find_sequence_delimiter: (input: Uint8Array) => number;
    apply_modality_lut: (input: Uint8Array, slope: number, intercept: number, bits: number, repr: number) => Float32Array;
    apply_voi_lut: (input: Float32Array, wc: number, ww: number) => Uint8Array;
    memory: WebAssembly.Memory;
    [key: string]: unknown;
}

interface CoreModule {
    instance: WebAssembly.Instance | null; // wasm-bindgen stores instance internally
    memory: WebAssembly.Memory;
    exports: CoreExports;
}

export class ZigCoreLoader {
    private static instance: ZigCoreLoader;
    private module: CoreModule | null = null;
    private basePath: string = "";

    private constructor() {}

    public static getInstance(): ZigCoreLoader {
        if (!ZigCoreLoader.instance) {
            ZigCoreLoader.instance = new ZigCoreLoader();
        }
        return ZigCoreLoader.instance;
    }

    public setBasePath(path: string): void {
        this.basePath = path.endsWith("/") ? path : path + "/";
    }

    public async load(): Promise<CoreModule> {
        if (this.module) return this.module;

        try {
            // Locate the generated JS file
            // We assume it's in a known location relative to this file or configured via basePath.
            // For development: ../../dist/package/rad-core/rad_core_wasm.js

            // Dynamic import the glue code
            // Note: In Node, we might need absolute path. In Browser, URL.

            let jsPath: string;
            // Check environment
            const isNode = typeof window === "undefined" && typeof process !== "undefined";

            // In a real bundler setup, we might import this statically, but we want dynamic loading.
            // We try to locate the file.

            let wasmPathOrBytes: string | BufferSource | undefined;

            if (isNode) {
                const path = await import("path");
                const fs = await import("fs");
                const url = await import("url");

                // Determine path to rad_core_wasm.js
                // Priority: basePath, or relative lookup
                let dir = this.basePath;
                if (!dir) {
                    // Try to resolve relative to this file
                    const __filename = url.fileURLToPath(import.meta.url);
                    const __dirname = path.dirname(__filename);
                    // Try src/core-wasm/dist (dev) or dist/package/rad-core (build)
                    const devPath = path.resolve(__dirname, "../../dist/package/rad-core");
                    if (fs.existsSync(path.join(devPath, "rad_core_wasm.js"))) {
                        dir = devPath;
                    } else {
                        // Fallback
                        dir = path.resolve(__dirname, "wasm-core");
                    }
                }

                jsPath = path.join(dir, "rad_core_wasm.js");
                const wasmPath = path.join(dir, "rad_core_wasm_bg.wasm");

                if (fs.existsSync(wasmPath)) {
                    wasmPathOrBytes = fs.readFileSync(wasmPath);
                }

                // In Node, we need to import via file URL
                jsPath = url.pathToFileURL(jsPath).href;

            } else {
                // Browser
                // Assume generated JS is served at basePath/rad_core_wasm.js
                const prefix = this.basePath || "wasm-core/";
                jsPath = prefix + "rad_core_wasm.js";
                // wasm-bindgen generated code in browser fetches .wasm relative to .js automatically usually,
                // or we can pass url.
                // If we pass a string to init(), it treats it as URL to WASM.
                wasmPathOrBytes = prefix + "rad_core_wasm_bg.wasm";
            }

            // Import the glue
            const glue = await import(jsPath);
            const init = glue.default;

            // Initialize
            // If wasmPathOrBytes is provided, use it.
            // If Node, it must be bytes (Buffer).
            // If Browser, it can be URL.
            await init(wasmPathOrBytes);

            this.module = {
                instance: null, // bindgen hides it
                memory: glue.wasm.memory, // Exposed via glue.wasm (if using target web?)
                exports: glue as CoreExports
            };

            // Note: glue exports function directly. glue.parse_is calls wasm.
            // glue.wasm object holds memory and direct exports.

            return this.module;

        } catch (e) {
            console.error("Failed to load core WASM:", e);
            throw e;
        }
    }

    public getModule(): CoreModule {
        if (!this.module) throw new Error("Core module not loaded");
        return this.module;
    }
}
