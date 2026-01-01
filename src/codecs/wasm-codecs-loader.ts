/**
 * WASM Codec Loader - Loads individual codec WebAssembly modules on demand.
 *
 * Supported codecs:
 * - jpeg: JPEG/JPEG Baseline (Pure Rust)
 * - j2k: JPEG 2000 (Stubbed - requires C toolchain)
 * - jpegls: JPEG-LS (Stubbed - requires C++ toolchain)
 * - rle: RLE Lossless (Pure Rust)
 * - htj2k: High-Throughput JPEG 2000 (Stubbed - requires C++ toolchain)
 * - ljpeg: JPEG Lossless (Pure Rust ljpeg crate)
 */

export type CodecType = "jpeg" | "j2k" | "jpegls" | "rle" | "htj2k" | "ljpeg";

interface CodecModule {
    instance: WebAssembly.Instance | null;
    memory: WebAssembly.Memory;
    exports: any;
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

    public setBasePath(path: string): void {
        this.basePath = path.endsWith("/") ? path : path + "/";
    }

    public async loadCodec(codec: CodecType): Promise<CodecModule> {
        if (this.loadedModules.has(codec)) {
            return this.loadedModules.get(codec)!;
        }
        if (this.loadingPromises.has(codec)) {
            return this.loadingPromises.get(codec)!;
        }

        const jsFileName = `rad_codecs_${codec}.js`; // Underscore naming from Rust
        const wasmFileName = `rad_codecs_${codec}_bg.wasm`;

        const loadPromise = (async () => {
            try {
                let jsPath: string;
                let wasmPathOrBytes: string | BufferSource | undefined;
                const isNode = typeof window === "undefined" && typeof process !== "undefined";

                if (isNode) {
                    const path = await import("path");
                    const fs = await import("fs");
                    const url = await import("url");

                    let dir = this.basePath;
                    if (!dir) {
                        const __filename = url.fileURLToPath(import.meta.url);
                        const __dirname = path.dirname(__filename);
                        // Try src (dev) or dist
                        const devPath = path.resolve(__dirname, `../../dist/package/rad-codecs-${codec}`);
                        if (fs.existsSync(path.join(devPath, jsFileName))) {
                            dir = devPath;
                        } else {
                            dir = path.resolve(__dirname, `wasm-codecs/${codec}`); // Hypothetical dist loc
                        }
                    }

                    jsPath = path.join(dir, jsFileName);
                    const wasmPath = path.join(dir, wasmFileName);

                    if (fs.existsSync(wasmPath)) {
                        wasmPathOrBytes = fs.readFileSync(wasmPath);
                    }

                    jsPath = url.pathToFileURL(jsPath).href;

                } else {
                    const prefix = this.basePath || "wasm-codecs/";
                    jsPath = prefix + jsFileName;
                    wasmPathOrBytes = prefix + wasmFileName;
                }

                const glue = await import(jsPath);
                const init = glue.default;
                await init(wasmPathOrBytes);

                const module: CodecModule = {
                    instance: null,
                    memory: glue.wasm.memory,
                    exports: glue,
                };

                this.loadedModules.set(codec, module);
                return module;
            } catch (e) {
                console.error(`Failed to load codec ${codec}:`, e);
                throw e;
            } finally {
                this.loadingPromises.delete(codec);
            }
        })();

        this.loadingPromises.set(codec, loadPromise);
        return loadPromise;
    }

    public getCodec(codec: CodecType): CodecModule {
        const module = this.loadedModules.get(codec);
        if (!module) {
            throw new Error(`Codec ${codec} not loaded. Call loadCodec() first.`);
        }
        return module;
    }

    public isLoaded(codec: CodecType): boolean {
        return this.loadedModules.has(codec);
    }

    public unloadCodec(codec: CodecType): void {
        this.loadedModules.delete(codec);
    }

    public unloadAll(): void {
        this.loadedModules.clear();
    }

    public static getCodecForTransferSyntax(transferSyntaxUid: string): CodecType | null {
        switch (transferSyntaxUid) {
            case "1.2.840.10008.1.2.4.50":
            case "1.2.840.10008.1.2.4.51":
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

            case "1.2.840.10008.1.2.4.90":
            case "1.2.840.10008.1.2.4.91":
            case "1.2.840.10008.1.2.4.201":
            case "1.2.840.10008.1.2.4.202":
            case "1.2.840.10008.1.2.4.203":
                return "j2k";

            case "1.2.840.10008.1.2.4.178":
                return "htj2k";

            case "1.2.840.10008.1.2.4.57":
            case "1.2.840.10008.1.2.4.70":
                return "ljpeg";

            case "1.2.840.10008.1.2.4.80":
            case "1.2.840.10008.1.2.4.81":
                return "jpegls";

            case "1.2.840.10008.1.2.5":
                return "rle";

            default:
                return null;
        }
    }
}
