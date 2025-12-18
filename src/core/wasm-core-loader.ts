/**
 * WASM Core Loader - Loads the core WebAssembly module for DICOM parsing utilities.
 *
 * This is independent from the codec loader. Core provides:
 * - DS (Decimal String) parsing
 * - IS (Integer String) parsing
 * - DA (Date) parsing
 * - TM (Time) parsing
 * - Modality LUT application
 * - VOI LUT application
 */

interface CoreModule {
    instance: WebAssembly.Instance;
    memory: WebAssembly.Memory;
    exports: Record<string, unknown>;
}

const WASI_IMPORTS = {
    fd_write: () => 0,
    fd_read: () => 0,
    fd_close: () => 0,
    fd_seek: () => 0,
    environ_get: () => 0,
    environ_sizes_get: () => 0,
    proc_exit: () => {},
    clock_time_get: () => 0,
    path_open: () => 0,
    fd_fdstat_get: () => 0,
    fd_prestat_get: () => 0,
    fd_prestat_dir_name: () => 0,
    args_sizes_get: () => 0,
    args_get: () => 0,
    random_get: (_buf: number, _buf_len: number) => 0,
    fd_fdstat_set_flags: (_fd: number, _flags: number) => 0,
};

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

    /**
     * Set the base path for locating the WASM file.
     */
    public setBasePath(path: string): void {
        this.basePath = path.endsWith("/") ? path : path + "/";
    }

    /**
     * Load the core module.
     */
    public async load(): Promise<CoreModule> {
        if (this.module) {
            return this.module;
        }

        const wasmFileName = "rad-core.wasm";
        let bytes: BufferSource;

        // Check for embedded WASM (injected during build)
        // @ts-ignore
        if (typeof __RAD_PARSER_CORE_WASM__ !== "undefined") {
            // @ts-ignore
            const base64 = __RAD_PARSER_CORE_WASM__;
            const binaryString = atob(base64);
            const len = binaryString.length;
            const u8 = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                u8[i] = binaryString.charCodeAt(i);
            }
            bytes = u8.buffer;
        } else {
            // @ts-ignore
            const isStandalone =
                typeof __RAD_STANDALONE__ !== "undefined" && __RAD_STANDALONE__;

            if (!isStandalone && typeof window === "undefined") {
                // Node.js environment
                const fs = await import("fs");
                const path = await import("path");
                const url = await import("url");

                let wasmPath: string;
                if (this.basePath) {
                    wasmPath = path.join(this.basePath, wasmFileName);
                } else {
                    // Default path relative to this file
                    try {
                        const __filename = url.fileURLToPath(import.meta.url);
                        const __dirname = path.dirname(__filename);

                        // Priority 0: dist/package/wasm-core (Package Distribution)
                        const packagePath = path.resolve(
                            __dirname,
                            "wasm-core",
                            wasmFileName
                        );

                        // Priority 1: dist/wasm-core (Bundle)
                        const distPath = path.resolve(
                            __dirname,
                            "../../wasm-core",
                            wasmFileName
                        );

                        // Priority 2: src/zig-core/zig-out/bin (Dev)
                        const devPath = path.resolve(
                            __dirname,
                            "../../src/zig-core/zig-out/bin",
                            wasmFileName
                        );

                        // Priority 3: ../wasm-core (Relative to index-core.js in dist)
                        const relativeDist = path.resolve(
                            __dirname,
                            "../wasm-core",
                            wasmFileName
                        );

                        if (fs.existsSync(packagePath)) {
                            wasmPath = packagePath;
                        } else if (fs.existsSync(distPath)) {
                            wasmPath = distPath;
                        } else if (fs.existsSync(devPath)) {
                            wasmPath = devPath;
                        } else if (fs.existsSync(relativeDist)) {
                            wasmPath = relativeDist;
                        } else {
                            // Fallback: Check local dir (legacy)
                            wasmPath = path.resolve(__dirname, wasmFileName);
                        }
                    } catch {
                        // Fallback for environments where import.meta.url is not available
                        wasmPath = path.resolve(
                            process.cwd(),
                            "dist/package/wasm-core",
                            wasmFileName
                        );
                    }
                }

                if (!fs.existsSync(wasmPath)) {
                    throw new Error(`Core WASM file not found at ${wasmPath}`);
                }

                bytes = fs.readFileSync(wasmPath);
            } else {
                // Browser environment
                const wasmUrl = this.basePath
                    ? this.basePath + wasmFileName
                    : "wasm-core/" + wasmFileName; // Default relative path

                const response = await fetch(wasmUrl);
                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch ${wasmUrl}: ${response.status} ${response.statusText}`
                    );
                }
                bytes = await response.arrayBuffer();
            }
        }

        try {
            const compiled = await WebAssembly.compile(bytes);
            const memory = new WebAssembly.Memory({
                initial: 256,
                maximum: 1024,
            });

            const instance = await WebAssembly.instantiate(compiled, {
                env: { memory },
                wasi_snapshot_preview1: WASI_IMPORTS,
            });

            this.module = {
                instance,
                memory:
                    (instance.exports.memory as WebAssembly.Memory) || memory,
                exports: instance.exports as Record<string, unknown>,
            };

            return this.module;
        } catch (e) {
            throw new Error(`Failed to load core module: ${e}`);
        }
    }

    /**
     * Get the loaded module. Throws if not loaded.
     */
    public getModule(): CoreModule {
        if (!this.module) {
            throw new Error("Core module not loaded. Call load() first.");
        }
        return this.module;
    }

    /**
     * Check if the module is loaded.
     */
    public isLoaded(): boolean {
        return this.module !== null;
    }

    /**
     * Unload the module to free memory.
     */
    public unload(): void {
        this.module = null;
    }
}
