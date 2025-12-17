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

        if (typeof window === "undefined") {
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
                    // Try bundled location first (dist directory)
                    wasmPath = path.resolve(__dirname, "../../", wasmFileName);
                    if (!fs.existsSync(wasmPath)) {
                        // Fallback to development location
                        wasmPath = path.resolve(__dirname, "../zig-codecs/zig-out/bin", wasmFileName);
                    }
                } catch {
                    // Fallback for environments where import.meta.url is not available
                    wasmPath = path.resolve(process.cwd(), "dist", wasmFileName);
                }
            }

            bytes = fs.readFileSync(wasmPath);
        } else {
            // Browser environment
            const wasmUrl = this.basePath + wasmFileName;
            const response = await fetch(wasmUrl);
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch ${wasmUrl}: ${response.status} ${response.statusText}`,
                );
            }
            bytes = await response.arrayBuffer();
        }

        try {
            const module = await WebAssembly.compile(bytes);
            const memory = new WebAssembly.Memory({
                initial: 256,
                maximum: 1024,
            });

            const instance = await WebAssembly.instantiate(module, {
                env: { memory },
                wasi_snapshot_preview1: WASI_IMPORTS,
            });

            const codecModule: CodecModule = {
                instance,
                memory:
                    (instance.exports.memory as WebAssembly.Memory) || memory,
                exports: instance.exports as Record<string, unknown>,
            };

            this.loadedModules.set(codec, codecModule);
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
                `Codec ${codec} not loaded. Call loadCodec() first.`,
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
        transferSyntaxUid: string,
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
            // JPEG Lossless
            case "1.2.840.10008.1.2.4.70":
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
