/**
 * WASM Codec Loader - Loads codec WebAssembly modules on demand.
 *
 * Codec types map onto two Rust modules:
 * - rle: RLE Lossless (rad-codecs-rle)
 * - jpeg, ljpeg, jpegls, j2k, htj2k: JPEG 1 (baseline, extended, lossless), JPEG-LS,
 *   JPEG 2000 and HTJ2K, all served by one jpegexp-rs build (rad-codecs-jpegexp)
 */

export type CodecType = 'jpeg' | 'j2k' | 'jpegls' | 'rle' | 'htj2k' | 'ljpeg';

type WasmModuleName = 'rle' | 'jpegexp';

const MODULE_FOR_CODEC: Record<CodecType, WasmModuleName> = {
  rle: 'rle',
  jpeg: 'jpegexp',
  ljpeg: 'jpegexp',
  jpegls: 'jpegexp',
  j2k: 'jpegexp',
  htj2k: 'jpegexp',
};

interface CodecModule {
  instance: WebAssembly.Instance | null;
  memory: WebAssembly.Memory;
  exports: any;
}

export class WasmCodecLoader {
  private static instance: WasmCodecLoader;
  private loadedModules: Map<WasmModuleName, CodecModule> = new Map();
  private loadingPromises: Map<WasmModuleName, Promise<CodecModule>> = new Map();
  private basePath: string = '';

  private constructor() {}

  public static getInstance(): WasmCodecLoader {
    if (!WasmCodecLoader.instance) {
      WasmCodecLoader.instance = new WasmCodecLoader();
    }
    return WasmCodecLoader.instance;
  }

  public setBasePath(path: string): void {
    this.basePath = path.endsWith('/') ? path : path + '/';
  }

  public async loadCodec(codec: CodecType): Promise<CodecModule> {
    const moduleName = MODULE_FOR_CODEC[codec];
    const loaded = this.loadedModules.get(moduleName);
    if (loaded) {
      return loaded;
    }
    const pending = this.loadingPromises.get(moduleName);
    if (pending) {
      return pending;
    }

    const jsFileName = `rad_codecs_${moduleName}.js`; // Underscore naming from Rust
    const wasmFileName = `rad_codecs_${moduleName}_bg.wasm`;

    const loadPromise = (async () => {
      try {
        let jsPath: string;
        let wasmPathOrBytes: string | BufferSource | undefined;
        const isNode = typeof window === 'undefined' && typeof process !== 'undefined';

        if (isNode) {
          const path = await import('path');
          const fs = await import('fs');
          const url = await import('url');

          let dir = this.basePath;
          if (!dir) {
            const __filename = url.fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            // Try src (dev) or dist
            const devPath = path.resolve(__dirname, `../../dist/package/rad-codecs-${moduleName}`);
            if (fs.existsSync(path.join(devPath, jsFileName))) {
              dir = devPath;
            } else {
              dir = path.resolve(__dirname, `../../rad-codecs-${moduleName}`); // from dist/package/{esm,cjs}/codecs
            }
          }

          jsPath = path.join(dir, jsFileName);
          const wasmPath = path.join(dir, wasmFileName);

          if (fs.existsSync(wasmPath)) {
            wasmPathOrBytes = fs.readFileSync(wasmPath);
          }

          jsPath = url.pathToFileURL(jsPath).href;
        } else {
          const prefix = this.basePath || 'wasm-codecs/';
          jsPath = prefix + jsFileName;
          wasmPathOrBytes = prefix + wasmFileName;
        }

        const glue = await import(jsPath);
        // wasm-bindgen `--target web` glue: init resolves to the raw instance exports.
        const instanceExports = await glue.default({
          module_or_path: wasmPathOrBytes,
        });

        const module: CodecModule = {
          instance: null,
          memory: instanceExports.memory,
          exports: glue,
        };

        this.loadedModules.set(moduleName, module);
        return module;
      } catch (e) {
        console.error(`Failed to load codec ${codec} (module ${moduleName}):`, e);
        throw e;
      } finally {
        this.loadingPromises.delete(moduleName);
      }
    })();

    this.loadingPromises.set(moduleName, loadPromise);
    return loadPromise;
  }

  public getCodec(codec: CodecType): CodecModule {
    const module = this.loadedModules.get(MODULE_FOR_CODEC[codec]);
    if (!module) {
      throw new Error(`Codec ${codec} not loaded. Call loadCodec() first.`);
    }
    return module;
  }

  public isLoaded(codec: CodecType): boolean {
    return this.loadedModules.has(MODULE_FOR_CODEC[codec]);
  }

  public unloadCodec(codec: CodecType): void {
    this.loadedModules.delete(MODULE_FOR_CODEC[codec]);
  }

  public unloadAll(): void {
    this.loadedModules.clear();
  }

  public static getCodecForTransferSyntax(transferSyntaxUid: string): CodecType | null {
    switch (transferSyntaxUid) {
      case '1.2.840.10008.1.2.4.50':
      case '1.2.840.10008.1.2.4.51':
      case '1.2.840.10008.1.2.4.52':
      case '1.2.840.10008.1.2.4.53':
      case '1.2.840.10008.1.2.4.54':
      case '1.2.840.10008.1.2.4.55':
      case '1.2.840.10008.1.2.4.56':
      case '1.2.840.10008.1.2.4.58':
      case '1.2.840.10008.1.2.4.59':
      case '1.2.840.10008.1.2.4.60':
      case '1.2.840.10008.1.2.4.61':
      case '1.2.840.10008.1.2.4.62':
      case '1.2.840.10008.1.2.4.63':
      case '1.2.840.10008.1.2.4.64':
      case '1.2.840.10008.1.2.4.65':
      case '1.2.840.10008.1.2.4.66':
        return 'jpeg';

      case '1.2.840.10008.1.2.4.90':
      case '1.2.840.10008.1.2.4.91':
        return 'j2k';

      case '1.2.840.10008.1.2.4.201': // HTJ2K Lossless
      case '1.2.840.10008.1.2.4.202': // HTJ2K Lossless RPCL
      case '1.2.840.10008.1.2.4.203': // HTJ2K
        return 'htj2k';

      case '1.2.840.10008.1.2.4.57':
      case '1.2.840.10008.1.2.4.70':
        return 'ljpeg';

      case '1.2.840.10008.1.2.4.80':
      case '1.2.840.10008.1.2.4.81':
        return 'jpegls';

      case '1.2.840.10008.1.2.5':
        return 'rle';

      default:
        return null;
    }
  }
}
