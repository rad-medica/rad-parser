import fs from "fs";
import path from "path";
import {
    parse,
    extractPixelData,
    registry,
    RleCodec,
    Jpeg2000Decoder,
    JpegLsDecoder,
    JpegLosslessDecoder,
    VideoDecoder,
    WebGlDecoder,
    WebGpuDecoder,
    NodePngEncoder,
    JpegLosslessNativeDecoder,
    AutoDetectCodec,
    DicomDataSet,
} from "../src/index";
import { writeBmp } from "./bmp";

// Register Plugins
registry.register(new RleCodec());
registry.register(new Jpeg2000Decoder());
registry.register(new JpegLsDecoder());
registry.register(new JpegLosslessDecoder());
registry.register(new VideoDecoder());
registry.register(new WebGlDecoder());
registry.register(new WebGpuDecoder());
registry.register(new JpegLosslessNativeDecoder());
registry.register(new AutoDetectCodec());

const EXAMPLES_DIR = path.join(process.cwd(), "test_data", "examples");
const RESULTS_DIR = path.join(process.cwd(), "results");

if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function getAllFiles(dir: string, fileList: string[] = []) {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllFiles(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    });
    return fileList;
}

async function processFile(filePath: string) {
    const fileName = path.basename(filePath);
    const relPath = path
        .relative(EXAMPLES_DIR, filePath)
        .replace(/[\/\\]/g, "_");
    const resultBase = path.join(RESULTS_DIR, relPath);

    console.log(`Processing: ${relPath}`);

    try {
        const buffer = fs.readFileSync(filePath);
        const data = new Uint8Array(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength,
        );

        // 1. Parse
        let dataset: DicomDataSet;
        try {
            dataset = parse(data);
            fs.writeFileSync(
                `${resultBase}.json`,
                JSON.stringify(
                    {
                        transferSyntax: dataset.transferSyntax,
                        rows: dataset.dict["x00280010"]?.Value,
                        columns: dataset.dict["x00280011"]?.Value,
                        bitsAllocated: dataset.dict["x00280100"]?.Value,
                        samplesPerPixel: dataset.dict["x00280002"]?.Value,
                        photometricInterpretation:
                            dataset.dict["x00280004"]?.Value,
                        tags: Object.keys(dataset.dict).length,
                    },
                    null,
                    2,
                ),
            );
        } catch (parseErr) {
            console.error(`  - Parse Failed: ${parseErr.message}`);
            fs.writeFileSync(
                `${resultBase}_error.txt`,
                `Parse Error: ${parseErr.message}`,
            );
            return;
        }

        // 2. Extract Pixel Data
        try {
            // console.log(`  - Extracting Pixel Data...`);
            const info = extractPixelData(data);

            if (info) {
                let decoded: Uint8Array | null = null;

                if (info.isEncapsulated) {
                    const decoder = await registry.getDecoder(
                        info.transferSyntax,
                    );
                    if (decoder) {
                        const fragments =
                            info.fragments as unknown as Uint8Array[];
                        try {
                            decoded = await decoder.decode(fragments, 0, {
                                transferSyntax: info.transferSyntax,
                                rows: dataset.uint16("x00280010"),
                                columns: dataset.uint16("x00280011"),
                            });
                            // Success RLE (or other)
                            const folder = path.join(
                                RESULTS_DIR,
                                "decoded_rle",
                            );
                            if (!fs.existsSync(folder))
                                fs.mkdirSync(folder, { recursive: true });

                            fs.writeFileSync(
                                path.join(folder, `${fileName}.raw`),
                                decoded,
                            );

                            // BMP
                            const rows = dataset.uint16("x00280010");
                            const col = dataset.uint16("x00280011");
                            const bits = dataset.uint16("x00280100") || 8;
                            const samples = dataset.uint16("x00280002") || 1;

                            if (decoded && rows && col) {
                                let bmpData = decoded;
                                if (bits > 8 && samples === 1) {
                                    const numPixels = rows * col;
                                    const newBuf = new Uint8Array(numPixels);
                                    for (let i = 0; i < numPixels; i++)
                                        newBuf[i] = decoded[i * 2 + 1];
                                    bmpData = newBuf;
                                }
                                writeBmp(
                                    path.join(folder, `${fileName}.bmp`),
                                    col,
                                    rows,
                                    bmpData,
                                    samples,
                                );

                                // PNG (Native Node)
                                const png = new NodePngEncoder();
                                if (png.isSupported()) {
                                    try {
                                        const pngFrames = await png.encode(
                                            bmpData,
                                            "png",
                                            col,
                                            rows,
                                            samples,
                                            bits,
                                        );
                                        if (pngFrames.length > 0) {
                                            fs.writeFileSync(
                                                path.join(
                                                    folder,
                                                    `${fileName}.png`,
                                                ),
                                                pngFrames[0],
                                            );
                                            console.log(
                                                `  - Saved ${fileName}.png`,
                                            );
                                        }
                                    } catch (pngErr) {
                                        console.warn(
                                            `  - PNG Gen Failed: ${pngErr.message}`,
                                        );
                                    }
                                }
                            }

                            // Verify Encoding (Round Trip)
                            try {
                                const encoder = await registry.getEncoder(
                                    info.transferSyntax,
                                );
                                if (encoder) {
                                    const encodedFrames = await encoder.encode(
                                        decoded,
                                        info.transferSyntax,
                                        col,
                                        rows,
                                        samples,
                                        bits,
                                    );
                                    if (encodedFrames.length > 0) {
                                        fs.writeFileSync(
                                            path.join(
                                                folder,
                                                `${fileName}.rle`,
                                            ),
                                            encodedFrames[0],
                                        );
                                    }
                                }
                            } catch (e) {
                                /* ignore or log capability gap */
                            }
                        } catch (decodeErr) {
                            // Decoder exists but failed (likely Adapter not configured)
                            const folder = path.join(
                                RESULTS_DIR,
                                "unsupported_extracted",
                            );
                            if (!fs.existsSync(folder))
                                fs.mkdirSync(folder, { recursive: true });

                            fs.writeFileSync(
                                path.join(folder, `${fileName}.enc`),
                                info.pixelData,
                            );
                            fs.writeFileSync(
                                path.join(folder, `${fileName}_error.txt`),
                                `Decode Failed: ${decodeErr.message}`,
                            );
                        }
                    } else {
                        // No decoder found
                        const folder = path.join(
                            RESULTS_DIR,
                            "unsupported_extracted",
                        );
                        if (!fs.existsSync(folder))
                            fs.mkdirSync(folder, { recursive: true });
                        fs.writeFileSync(
                            path.join(folder, `${fileName}.enc`),
                            info.pixelData,
                        );
                    }
                } else {
                    // Native
                    decoded = info.pixelData;
                    const folder = path.join(RESULTS_DIR, "native_decoded");
                    if (!fs.existsSync(folder))
                        fs.mkdirSync(folder, { recursive: true });

                    fs.writeFileSync(
                        path.join(folder, `${fileName}.raw`),
                        info.pixelData,
                    );

                    // BMP
                    const rows = dataset.uint16("x00280010");
                    const col = dataset.uint16("x00280011");
                    const bits = dataset.uint16("x00280100") || 8;
                    const samples = dataset.uint16("x00280002") || 1;

                    if (decoded && rows && col) {
                        let bmpData = decoded;
                        if (bits > 8 && samples === 1) {
                            const numPixels = rows * col;
                            const newBuf = new Uint8Array(numPixels);
                            if (decoded.length >= numPixels * 2) {
                                for (let i = 0; i < numPixels; i++)
                                    newBuf[i] = decoded[i * 2 + 1];
                                bmpData = newBuf;
                            }
                        }
                        writeBmp(
                            path.join(folder, `${fileName}.bmp`),
                            col,
                            rows,
                            bmpData,
                            samples,
                        );
                    }
                }
            } else {
                console.log(`  - No Pixel Data found`);
            }
        } catch (extractErr) {
            console.warn(`  - Pixel Extraction Failed: ${extractErr.message}`);
            fs.writeFileSync(
                `${resultBase}_pixel_error.txt`,
                `Extraction Error: ${extractErr.message}`,
            );
        }
    } catch (err) {
        console.error(`  - System Error: ${err.message}`);
    }
}

async function main() {
    console.log(`Scanning ${EXAMPLES_DIR}...`);
    const files = getAllFiles(EXAMPLES_DIR);
    console.log(`Found ${files.length} files.`);

    for (const file of files) {
        if (
            file.toLowerCase().endsWith(".md") ||
            file.toLowerCase().endsWith(".txt")
        )
            continue;

        await processFile(file);
    }
    console.log("Done.");
}

main().catch(console.error);
