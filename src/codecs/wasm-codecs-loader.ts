/**
 * WASM Codec Loader - Loads individual codec WebAssembly modules on demand.
 *
 * Supported codecs:
 * - jpeg: JPEG/JPEG Baseline (LibJPEG-Turbo)
 * - j2k: JPEG 2000 (OpenJPEG)
 * - jpegls: JPEG-LS (CharLS)
 * - rle: RLE Lossless
 */

export type CodecType = "jpeg" | "j2k" | "jpegls" | "rle" | "htj2k" | "ljpeg";

interface CodecModule {
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

export class ZigWasmCodecLoader {
    private static instance: ZigWasmCodecLoader;
    private loadedModules: Map<CodecType, CodecModule> = new Map();
    private basePath: string = "";

    private constructor() {}

    public static getInstance(): ZigWasmCodecLoader {
        if (!ZigWasmCodecLoader.instance) {
            ZigWasmCodecLoader.instance = new ZigWasmCodecLoader();
        }
        return ZigWasmCodecLoader.instance;
    }

    /**
     * Set the base path for locating WASM files.
     * For Node.js, this should be the directory containing the .wasm files.
     * For browser, this should be the URL path prefix.
     */
    public setBasePath(path: string): void {
        this.basePath = path.endsWith("/") ? path : path + "/";
    }

    /**
     * Load a specific codec module.
     */
    public async loadCodec(codec: CodecType): Promise<CodecModule> {
        // Return cached module if already loaded
        if (this.loadedModules.has(codec)) {
            return this.loadedModules.get(codec)!;
        }

        const wasmFileName = `rad-codecs-${codec}.wasm`;
        let bytes: BufferSource;

        // Check for embedded WASM
        // @ts-ignore
        if (typeof __RAD_STANDALONE__ !== "undefined" && __RAD_STANDALONE__) {
            let base64: string | undefined;

            switch (codec) {
                case "jpeg":
                    // @ts-ignore
                    if (typeof __RAD_PARSER_CODEC_JPEG_WASM__ !== "undefined")
                        base64 = __RAD_PARSER_CODEC_JPEG_WASM__;
                    break;
                case "j2k":
                    // @ts-ignore
                    if (typeof __RAD_PARSER_CODEC_J2K_WASM__ !== "undefined")
                        base64 = __RAD_PARSER_CODEC_J2K_WASM__;
                    break;
                case "jpegls":
                    // @ts-ignore
                    if (typeof __RAD_PARSER_CODEC_JPEGLS_WASM__ !== "undefined")
                        base64 = __RAD_PARSER_CODEC_JPEGLS_WASM__;
                    break;
                case "rle":
                    // @ts-ignore
                    if (typeof __RAD_PARSER_CODEC_RLE_WASM__ !== "undefined")
                        base64 = __RAD_PARSER_CODEC_RLE_WASM__;
                    break;
                case "htj2k":
                    // @ts-ignore
                    if (typeof __RAD_PARSER_CODEC_HTJ2K_WASM__ !== "undefined")
                        base64 = __RAD_PARSER_CODEC_HTJ2K_WASM__;
                    break;
                case "ljpeg":
                    // @ts-ignore
                    if (typeof __RAD_PARSER_CODEC_LJPEG_WASM__ !== "undefined")
                        base64 = __RAD_PARSER_CODEC_LJPEG_WASM__;
                    break;
            }

            if (base64) {
                const binaryString = atob(base64);
                const len = binaryString.length;
                const u8 = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    u8[i] = binaryString.charCodeAt(i);
                }
                bytes = u8.buffer;
            }
        }

        if (!bytes!) {
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
                    // Default path relative to this file - works in both development and bundled environments
                    try {
                        const __filename = url.fileURLToPath(import.meta.url);
                        const __dirname = path.dirname(__filename);

                        // Priority 0: dist/package/wasm-codecs (Package Distribution)
                        const packagePath = path.resolve(
                            __dirname,
                            "wasm-codecs",
                            wasmFileName
                        );

                        // Priority 1: dist/wasm-codecs (Bundle)
                        const distPath = path.resolve(
                            __dirname,
                            "../../wasm-codecs",
                            wasmFileName
                        );

                        // Priority 2: src/zig-codecs/zig-out/bin (Dev)
                        const devPath = path.resolve(
                            __dirname,
                            "../../src/zig-codecs/zig-out/bin",
                            wasmFileName
                        );

                        // Priority 3: ../wasm-codecs (Relative to index-codecs.js in dist)
                        const relativeDist = path.resolve(
                            __dirname,
                            "../wasm-codecs",
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
                        // console.log(`Loading WASM from: ${wasmPath}`);
                    } catch {
                        // Fallback for environments where import.meta.url is not available
                        wasmPath = path.resolve(
                            process.cwd(),
                            "dist/package/wasm-codecs",
                            wasmFileName
                        );
                        // console.log(`Loading WASM from fallback CWD: ${wasmPath}`);
                    }
                }

                if (!fs.existsSync(wasmPath)) {
                    throw new Error(
                        `Codec WASM file (${codec}) not found at ${wasmPath}`
                    );
                }

                bytes = fs.readFileSync(wasmPath);
            } else {
                // Browser environment
                const wasmUrl = this.basePath
                    ? this.basePath + wasmFileName
                    : "wasm-codecs/" + wasmFileName; // Default relative path

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
            const module = await WebAssembly.compile(bytes);

            // Check if the module imports memory (from env.memory)
            // If it does, we need to provide it. If it exports memory, we use that.
            const moduleImports = WebAssembly.Module.imports(module);
            const needsMemoryImport = moduleImports.some(
                imp => imp.module === "env" && imp.name === "memory"
            );

            let memory: WebAssembly.Memory;
            if (needsMemoryImport) {
                // Module expects memory to be provided
                memory = new WebAssembly.Memory({
                    initial: 256,
                    maximum: 1024,
                });
            } else {
                // Module will export its own memory, create a placeholder that will be replaced
                memory = new WebAssembly.Memory({
                    initial: 256,
                    maximum: 1024,
                });
            }

            const instance = await WebAssembly.instantiate(module, {
                env: needsMemoryImport ? { memory } : {},
                wasi_snapshot_preview1: WASI_IMPORTS,
            });

            // Use exported memory if available, otherwise use the one we provided
            const finalMemory =
                (instance.exports.memory as WebAssembly.Memory) || memory;

            const codecModule: CodecModule = {
                instance,
                memory: finalMemory,
                exports: instance.exports as Record<string, unknown>,
            };

            this.loadedModules.set(codec, codecModule);

            // Initialize the module if it has a start function or constructors
            // This is critical for C++ modules (like ljpeg/CharLS) that have static global objects.
            // @ts-ignore
            if (instance.exports._start) {
                try {
                    // @ts-ignore
                    instance.exports._start();
                } catch (e) {
                    // Ignore void return or exit code if successful
                    // Some WASI implementations might throw on exit(0)
                }
            } else {
                // @ts-ignore
                if (instance.exports.__wasm_call_ctors) {
                    // @ts-ignore
                    instance.exports.__wasm_call_ctors();
                }
            }

            return codecModule;
        } catch (e) {
            throw new Error(`Failed to load codec ${codec}: ${e}`);
        }
    }

    /**
     * Get a loaded codec module. Throws if not loaded.
     */
    public getCodec(codec: CodecType): CodecModule {
        const module = this.loadedModules.get(codec);
        if (!module) {
            throw new Error(
                `Codec ${codec} not loaded. Call loadCodec() first.`
            );
        }
        return module;
    }

    /**
     * Check if a codec is loaded.
     */
    public isLoaded(codec: CodecType): boolean {
        return this.loadedModules.has(codec);
    }

    /**
     * Unload a codec to free memory.
     */
    public unloadCodec(codec: CodecType): void {
        this.loadedModules.delete(codec);
    }

    /**
     * Unload all codecs.
     */
    public unloadAll(): void {
        this.loadedModules.clear();
    }

    /**
     * Map a DICOM Transfer Syntax UID to the appropriate codec type.
     */
    public static getCodecForTransferSyntax(
        transferSyntaxUid: string
    ): CodecType | null {
        switch (transferSyntaxUid) {
            // JPEG Baseline
            case "1.2.840.10008.1.2.4.50":
            case "1.2.840.10008.1.2.4.51":
            // JPEG Extended
            case "1.2.840.10008.1.2.4.52":
            case "1.2.840.10008.1.2.4.53":
            case "1.2.840.10008.1.2.4.54":
            case "1.2.840.10008.1.2.4.55":
            case "1.2.840.10008.1.2.4.56":

            case "1.2.840.10008.1.2.4.58":
            case "1.2.840.10008.1.2.4.59":
            case "1.2.840.10008.1.2.4.60":
            case "1.2.840.10008.1.2.4.61":
            case "1.2.840.10008.1.2.4.62":
            case "1.2.840.10008.1.2.4.63":
            case "1.2.840.10008.1.2.4.64":
            case "1.2.840.10008.1.2.4.65":
            case "1.2.840.10008.1.2.4.66":
                return "jpeg";

            // JPEG 2000
            case "1.2.840.10008.1.2.4.90":
            case "1.2.840.10008.1.2.4.91":
            case "1.2.840.10008.1.2.4.201":
            case "1.2.840.10008.1.2.4.202":
            case "1.2.840.10008.1.2.4.203":
                return "j2k";

            // HTJ2K
            case "1.2.840.10008.1.2.4.178":
                return "htj2k";

            // JPEG Lossless (Process 14) and Process 14 SV1
            case "1.2.840.10008.1.2.4.57":
            case "1.2.840.10008.1.2.4.70":
                return "ljpeg";

            // JPEG-LS
            case "1.2.840.10008.1.2.4.80":
            case "1.2.840.10008.1.2.4.81":
                return "jpegls";

            // RLE
            case "1.2.840.10008.1.2.5":
                return "rle";

            default:
                return null;
        }
    }
}
