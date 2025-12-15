export interface CodecInfo {
    multiFrame: boolean; // Does the codec handle multi-frame fragments individually?
}

export interface PixelDataCodec {
    name: string;
    priority: number;
    codecInfo: CodecInfo;
    isSupported(): Promise<boolean> | boolean;
    canDecode(transferSyntax: string): boolean;
    decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array>;

    // Encoding Support
    canEncode?(transferSyntax: string): boolean;
    encode?(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number,
    ): Promise<Uint8Array[]>;
}

// Type for a function that dynamically imports a codec module
type DynamicCodecLoader = () => Promise<{
    [key: string]: new () => PixelDataCodec;
}>;

export interface FunctionalCodecConfig {
    name: string;
    transferSyntaxes: string[];
    priority: number;
    isSupported?: () => Promise<boolean> | boolean;
    decode: (encodedBuffer: Uint8Array[], info: any) => Promise<Uint8Array>;
    encode?: (
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number,
    ) => Promise<Uint8Array[]>;
    codecInfo?: CodecInfo;
}

/**
 * A wrapper class to allow registering codecs from simple functions
 * without needing to define a full class structure.
 */
class FunctionalCodec implements PixelDataCodec {
    name: string;
    priority: number;
    codecInfo: CodecInfo;
    private transferSyntaxes: string[];
    private isSupportedFn: () => Promise<boolean> | boolean;
    private decodeFn: (
        encodedBuffer: Uint8Array[],
        info: any,
    ) => Promise<Uint8Array>;
    private encodeFn?: (
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number,
    ) => Promise<Uint8Array[]>;

    constructor(config: FunctionalCodecConfig) {
        this.name = config.name;
        this.priority = config.priority;
        this.transferSyntaxes = config.transferSyntaxes;
        this.decodeFn = config.decode;
        this.encodeFn = config.encode;
        this.isSupportedFn = config.isSupported || (() => true);
        this.codecInfo = config.codecInfo || { multiFrame: false };
    }

    isSupported = () => this.isSupportedFn();
    canDecode = (ts: string) => this.transferSyntaxes.includes(ts);
    decode = (buf: Uint8Array[], info: any) => this.decodeFn(buf, info);

    canEncode = (ts: string) =>
        !!this.encodeFn && this.transferSyntaxes.includes(ts);
    encode = (
        pixelData: Uint8Array,
        ts: string,
        w: number,
        h: number,
        s: number,
        b: number,
    ) => {
        if (!this.encodeFn) {
            throw new Error(`Encoding not supported by codec: ${this.name}`);
        }
        return this.encodeFn(pixelData, ts, w, h, s, b);
    };
}

export class CodecRegistry {
    private codecs: PixelDataCodec[] = [];
    private dynamicCodecs: Map<string, DynamicCodecLoader> = new Map();
    private loadingCodecs: Map<string, Promise<PixelDataCodec | null>> =
        new Map();

    register(codec: PixelDataCodec) {
        // Avoid duplicates
        if (!this.codecs.some((c) => c.name === codec.name)) {
            this.codecs.push(codec);
            this.codecs.sort((a, b) => b.priority - a.priority);
        }
    }

    registerDynamic(transferSyntax: string, loader: DynamicCodecLoader) {
        this.dynamicCodecs.set(transferSyntax, loader);
    }

    /**
     * Registers a codec using a configuration object and functions,
     * avoiding the need to create a dedicated class.
     * @param config - The codec configuration.
     */
    registerFunctional(config: FunctionalCodecConfig) {
        const codec = new FunctionalCodec(config);
        this.register(codec);
    }

    async getDecoder(transferSyntax: string): Promise<PixelDataCodec | null> {
        // 1. Check statically registered codecs first
        for (const codec of this.codecs) {
            if (
                codec.canDecode(transferSyntax) &&
                (await codec.isSupported())
            ) {
                return codec;
            }
        }

        // 2. Check if a dynamic loader is available
        const loader = this.dynamicCodecs.get(transferSyntax);
        if (!loader) {
            return null;
        }

        // 3. Handle concurrent loading
        if (this.loadingCodecs.has(transferSyntax)) {
            return this.loadingCodecs.get(transferSyntax)!;
        }

        // 4. Load, instantiate, and register the codec
        const loadPromise = (async () => {
            try {
                const codecModule = await loader();
                const codecClass = Object.values(codecModule)[0];
                if (!codecClass) throw new Error("Invalid codec module");

                const codecInstance = new codecClass();
                if (
                    codecInstance.canDecode(transferSyntax) &&
                    (await codecInstance.isSupported())
                ) {
                    this.register(codecInstance); // Add to static list for next time
                    return codecInstance;
                }
                return null;
            } catch (e) {
                console.error(
                    `Error dynamically loading codec for ${transferSyntax}:`,
                    e,
                );
                return null;
            } finally {
                this.loadingCodecs.delete(transferSyntax);
            }
        })();

        this.loadingCodecs.set(transferSyntax, loadPromise);
        return loadPromise;
    }

    async getEncoder(transferSyntax: string): Promise<PixelDataCodec | null> {
        for (const codec of this.codecs) {
            if (codec.canEncode && codec.canEncode(transferSyntax)) {
                if (await codec.isSupported()) {
                    return codec;
                }
            }
        }
        // Dynamic loading for encoders can be added here if needed
        return null;
    }

    getCodecs(): PixelDataCodec[] {
        return this.codecs;
    }
}

export const registry = new CodecRegistry();
