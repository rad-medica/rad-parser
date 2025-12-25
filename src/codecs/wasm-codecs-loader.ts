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

class ProcessExitError extends Error {
    constructor(public code: number) {
        super(`Process exited with code ${code}`);
    }
}

export class ZigWasmCodecLoader {
    private static instance: ZigWasmCodecLoader;
    private loadedModules: Map<CodecType, CodecModule> = new Map();
    private loadingPromises: Map<CodecType, Promise<CodecModule>> = new Map();
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

        // Return pending promise if already loading
        if (this.loadingPromises.has(codec)) {
            return this.loadingPromises.get(codec)!;
        }

        const jsFileName = `rad-codecs-${codec}.js`;

        const loadPromise = (async () => {
            try {
                // 1. Resolve path to the JS glue file
                // We rely on the bundler/runtime to find the file.
                // In Node, we might need absolute path if not bundled.
                // In Browser, usually served from base path.

                let factory: any;

                // Emscripten factory options
                const moduleOptions: any = {};

                // Handle Standalone (Embedded WASM)
                // @ts-ignore
                if (
                    typeof __RAD_STANDALONE__ !== "undefined" &&
                    __RAD_STANDALONE__
                ) {
                    let base64: string | undefined;
                    // ... (keep base64 selection logic if needed, or assume global map) ...
                    switch (codec) {
                        case "jpeg":
                            // @ts-ignore
                            if (
                                typeof __RAD_PARSER_CODEC_JPEG_WASM__ !==
                                "undefined"
                            )
                                base64 = __RAD_PARSER_CODEC_JPEG_WASM__;
                            break;
                        case "j2k":
                            // @ts-ignore
                            if (
                                typeof __RAD_PARSER_CODEC_J2K_WASM__ !==
                                "undefined"
                            )
                                base64 = __RAD_PARSER_CODEC_J2K_WASM__;
                            break;
                        case "htj2k":
                            // @ts-ignore
                            if (
                                typeof __RAD_PARSER_CODEC_HTJ2K_WASM__ !==
                                "undefined"
                            )
                                base64 = __RAD_PARSER_CODEC_HTJ2K_WASM__;
                            break;
                        case "jpegls":
                            // @ts-ignore
                            if (
                                typeof __RAD_PARSER_CODEC_JPEGLS_WASM__ !==
                                "undefined"
                            )
                                base64 = __RAD_PARSER_CODEC_JPEGLS_WASM__;
                            break;
                        case "ljpeg":
                            // @ts-ignore
                            if (
                                typeof __RAD_PARSER_CODEC_LJPEG_WASM__ !==
                                "undefined"
                            )
                                base64 = __RAD_PARSER_CODEC_LJPEG_WASM__;
                            break;
                        case "rle":
                            // @ts-ignore
                            if (
                                typeof __RAD_PARSER_CODEC_RLE_WASM__ !==
                                "undefined"
                            )
                                base64 = __RAD_PARSER_CODEC_RLE_WASM__;
                            break;
                    }

                    if (base64) {
                        const binaryString = atob(base64);
                        const len = binaryString.length;
                        const u8 = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            u8[i] = binaryString.charCodeAt(i);
                        }
                        moduleOptions.wasmBinary = u8.buffer;
                    }
                }

                // LocateFile override for non-embedded WASM
                if (!moduleOptions.wasmBinary) {
                    moduleOptions.locateFile = (
                        path: string,
                        prefix: string
                    ) => {
                        if (path.endsWith(".wasm")) {
                            if (this.basePath) {
                                return this.basePath + path;
                            }
                            // If running in Node without basePath, might need help
                            // But Emscripten usually defaults to same dir as JS
                            return prefix + path;
                        }
                        return prefix + path;
                    };
                }

                // Dynamic Import
                let moduleExports: any;

                // For Node.js (CommonJS or ESM)
                if (typeof window === "undefined") {
                    const path = await import("path");
                    const fs = await import("fs");
                    const url = await import("url");

                    let jsPath = "";
                    if (this.basePath) {
                        jsPath = path.join(this.basePath, jsFileName);
                    } else {
                        // Fallback attempt to find it relative to this file
                        // Note: This assumes the JS files are coped to the same dir as the loader in dist
                        // Or we use the dist/ location.
                        // Let's assume they are peer files for now.
                        let __dirname: string;
                        try {
                            __dirname = path.dirname(__filename);
                        } catch {
                            // @ts-ignore
                            if (
                                typeof import.meta !== "undefined" &&
                                import.meta.url
                            ) {
                                // @ts-ignore
                                __dirname = path.dirname(
                                    url.fileURLToPath(import.meta.url)
                                );
                            } else {
                                __dirname = process.cwd();
                            }
                        }

                        // Try various locations similar to before
                        const distPath = path.resolve(
                            __dirname,
                            "../../dist/package/wasm-codecs",
                            jsFileName
                        ); // From src/codecs
                        // Also try just next to it
                        const localPath = path.resolve(__dirname, jsFileName);

                        if (fs.existsSync(localPath)) jsPath = localPath;
                        else if (fs.existsSync(distPath)) jsPath = distPath;
                        else jsPath = localPath; // fallback
                    }

                    // In Node, we can use require or import.
                    // The generated files are ES6 modules (EXPORT_ES6=1, MODULARIZE=1).
                    // So we must use import().
                    // Windows path needs file:// prefix for import() if strict?
                    const importUrl = url.pathToFileURL(jsPath).href;
                    console.log(
                        `[Loader] Attempting to import JS glue from: ${jsPath} -> ${importUrl}`
                    );
                    moduleExports = await import(importUrl);
                } else {
                    // Browser
                    let importUrl = jsFileName;
                    if (this.basePath) {
                        importUrl = this.basePath + jsFileName;
                    } else {
                        importUrl = "./wasm-codecs/" + jsFileName;
                    }
                    moduleExports = await import(importUrl);
                }

                // The factory function is the default export
                factory = moduleExports.default || moduleExports;
                if (typeof factory !== "function") {
                    // Maybe it's named export? e.g. RadCodecsJpeg
                    // We can try to find the only function export
                    for (const key in moduleExports) {
                        if (
                            typeof moduleExports[key] === "function" &&
                            key.startsWith("RadCodecs")
                        ) {
                            factory = moduleExports[key];
                            break;
                        }
                    }
                }

                if (typeof factory !== "function") {
                    throw new Error(
                        `Could not find factory function in ${jsFileName}`
                    );
                }

                // Instantiate
                const instance = await factory(moduleOptions);

                // Wrap into CodecModule
                const codecModule: CodecModule = {
                    instance: instance, // Emscripten instance is not WebAssembly.Instance, but behaves like exports bag + properties
                    // Emscripten exposes memory as .wasmMemory (if -s IMPORTED_MEMORY is not used) or we can find it
                    memory: instance.wasmMemory || instance.HEAPU8.buffer,
                    exports: instance, // Emscripten exports functions directly on the instance object
                };

                // Fixup Interface:
                // CodecModule expects 'memory' to be WebAssembly.Memory (object with buffer property)
                // instance.wasmMemory IS usually that.
                // But instance.HEAPU8.buffer is ArrayBuffer.
                // We need to ensure we conform to interface CodecModule { memory: WebAssembly.Memory ... }
                // If instance.wasmMemory is present, we are good.
                // If not, we might be in trouble if we need to grow it manually?
                // Emscripten handles memory growth.
                // Let's check if we strictly need WebAssembly.Memory object or just something with a buffer.
                // zig-codecs uses loader.getCodec(c).memory.buffer, memory.grow()

                if (
                    !codecModule.memory ||
                    !(codecModule.memory instanceof WebAssembly.Memory)
                ) {
                    // Fallback check
                    if (instance.wasmMemory instanceof WebAssembly.Memory) {
                        codecModule.memory = instance.wasmMemory;
                    } else {
                        // Warn? Emscripten should provide it with -s MODULARIZE=1
                        console.warn(
                            "Emscripten module did not export wasmMemory. Memory growth might fail."
                        );
                    }
                }

                this.loadedModules.set(codec, codecModule);
                return codecModule;
            } catch (e: any) {
                console.error(`Failed to load codec ${codec}:`, e);
                throw e;
            } finally {
                this.loadingPromises.delete(codec);
            }
        })();

        this.loadingPromises.set(codec, loadPromise);
        return loadPromise;
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
