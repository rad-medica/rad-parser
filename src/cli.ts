import * as fs from "fs";
import * as path from "path";
import {
    NodePngEncoder,
    anonymize,
    formatTagWithComma,
    normalizeTag,
    parse,
    parseAndDecode,
    registry,
    write,
} from "./index";

// Manually register the PNG encoder for CLI use
registry.register(new NodePngEncoder());

const args = process.argv.slice(2);
const command = args[0];

async function run() {
    if (!command || ["help", "--help", "-h"].includes(command)) {
        printHelp();
        process.exit(0);
    }

    switch (command) {
        case "dump":
            if (!args[1]) {
                console.error("Usage: rad-parser dump <file>");
                process.exit(1);
            }
            dumpFile(args[1]);
            break;

        case "get":
            if (!args[1] || !args[2]) {
                console.error("Usage: rad-parser get <file> <tag>");
                process.exit(1);
            }
            getTag(args[1], args[2]);
            break;

        case "anonymize":
            if (!args[1]) {
                console.error("Usage: rad-parser anonymize <input> [output]");
                process.exit(1);
            }
            anonymizeFile(args[1], args[2]);
            break;

        case "convert":
            if (!args[1] || !args[2]) {
                console.error("Usage: rad-parser convert <input> <output>");
                process.exit(1);
            }
            await convertFile(args[1], args[2]);
            break;

        case "extract-image":
            if (!args[1] || !args[2]) {
                console.error(
                    "Usage: rad-parser extract-image <input.dcm> <output.png>"
                );
                process.exit(1);
            }
            await extractImage(args[1], args[2]);
            break;

        default:
            console.error(`Unknown command: ${command}`);
            printHelp();
            process.exit(1);
    }
}

function printHelp() {
    console.log(`
rad-parser CLI v2.1.0

A powerful command-line tool for inspecting, converting, and manipulating DICOM files.

Commands:
  dump <file>                  Parse and print all DICOM tags from a file.
  get <file> <tag>             Get the value of a specific DICOM tag.
                               Tag can be in format 'x00100010' or '0010,0010'.
  anonymize <input> [output]   Anonymize a DICOM file. Defaults to '<input>_anon.dcm'.
  convert <input> <output>     Convert a DICOM file to an uncompressed format.
  extract-image <in> <out.png> Decode the pixel data and save it as a PNG image.
  help, -h, --help             Show this help message.
    `);
}

function getTag(filePath: string, tag: string) {
    try {
        const buffer = fs.readFileSync(filePath);
        const dataset = parse(new Uint8Array(buffer), {
            type: "light",
        }) as import("./core/types").DicomDataSet;
        const normalizedTag = normalizeTag(tag);

        const element = dataset.elements[normalizedTag];

        if (element) {
            console.log(
                dataset.string(normalizedTag) || "[Binary or complex value]"
            );
        } else {
            console.error(`Tag ${tag} not found in file.`);
            process.exit(1);
        }
    } catch (e: any) {
        console.error(`Error processing file: ${e.message}`);
        process.exit(1);
    }
}

async function extractImage(inputFile: string, outputFile: string) {
    if (path.extname(outputFile).toLowerCase() !== ".png") {
        console.error("Output file must have a .png extension.");
        process.exit(1);
    }

    try {
        console.log(`Reading and decoding ${inputFile}...`);
        const buffer = fs.readFileSync(inputFile);
        const dataset = await parseAndDecode(new Uint8Array(buffer));

        const pixelDataElement = dataset.elements["x7fe00010"];
        if (
            !pixelDataElement ||
            !(pixelDataElement.Value instanceof Uint8Array)
        ) {
            throw new Error("No decoded pixel data found in the file.");
        }

        const rawPixelData = pixelDataElement.Value;

        const encodeOptions = {
            width: dataset.uint16("x00280011") || 0,
            height: dataset.uint16("x00280010") || 0,
            samplesPerPixel: dataset.uint16("x00280002") || 1,
            bitsAllocated: dataset.uint16("x00280100") || 8,
        };

        if (encodeOptions.width === 0 || encodeOptions.height === 0) {
            throw new Error(
                "Image dimensions (width/height) not found in DICOM file."
            );
        }

        console.log("Encoding image to PNG...");
        const encoder = await registry.getEncoder("png");
        if (!encoder || !encoder.encode) {
            throw new Error(
                "PNG encoder not available. Ensure you are in a Node.js environment."
            );
        }

        const pngFragments = await encoder.encode(
            rawPixelData,
            "png",
            encodeOptions.width,
            encodeOptions.height,
            encodeOptions.samplesPerPixel,
            encodeOptions.bitsAllocated
        );

        fs.writeFileSync(outputFile, Buffer.from(pngFragments[0]!));
        console.log(`Successfully saved image to ${outputFile}`);
    } catch (e: any) {
        console.error(`Error extracting image: ${e.message}`);
        process.exit(1);
    }
}

function dumpFile(filePath: string) {
    try {
        const buffer = fs.readFileSync(filePath);
        const dataset = parse(new Uint8Array(buffer), { type: "full" });

        console.log(`\nParsed ${filePath}:`);
        console.log(`Total Tags: ${Object.keys(dataset.dict).length}`);
        console.log("-".repeat(50));

        // Sort tags
        const sortedTags = Object.keys(dataset.dict).sort();

        for (const tag of sortedTags) {
            const element = (dataset.dict as any)[tag];
            const tagName = formatTagWithComma(tag);
            const vr = element.vr || "UN";
            let value = element.Value;

            // Format value for display
            if (value instanceof Uint8Array) {
                value = `[Binary Data: ${value.length} bytes]`;
            } else if (Array.isArray(value) && value[0] instanceof Uint8Array) {
                value = `[Binary Data / Fragments]`;
            } else if (typeof value === "object" && value !== null) {
                value = JSON.stringify(value);
            }

            // Truncate long values
            let displayValue = String(value);
            if (displayValue.length > 50) {
                displayValue = displayValue.substring(0, 47) + "...";
            }

            console.log(`${tagName} [${vr}] : ${displayValue}`);
        }
        console.log("-".repeat(50));
    } catch (e: any) {
        console.error(`Error parsing file: ${e.message}`);
        process.exit(1);
    }
}

function anonymizeFile(inputPath: string, outputPath?: string) {
    try {
        if (!outputPath) {
            const ext = path.extname(inputPath);
            const base = path.basename(inputPath, ext);
            outputPath = path.join(
                path.dirname(inputPath),
                `${base}_anon${ext}`
            );
        }

        const buffer = fs.readFileSync(inputPath);
        const dataset = parse(new Uint8Array(buffer), {
            type: "full",
        }) as import("./core/types").DicomDataSet;

        console.log(`Anonymizing ${inputPath}...`);
        const anonDataset = anonymize(dataset);

        console.log(`Writing to ${outputPath}...`);
        const outBytes = write(anonDataset);

        fs.writeFileSync(outputPath, outBytes);
        console.log("Done.");
    } catch (e: any) {
        console.error(`Error anonymizing file: ${e.message}`);
        process.exit(1);
    }
}

async function convertFile(inputPath: string, outputPath: string) {
    try {
        const buffer = fs.readFileSync(inputPath);
        console.log(`Reading ${inputPath}...`);
        const dataset = await parseAndDecode(new Uint8Array(buffer));

        console.log("Transcoded to Uncompressed.");

        // Re-write as Explicit VR Little Endian
        const targetTs = "1.2.840.10008.1.2.1";
        // Transfer Syntax is handled by write() options

        console.log(`Writing to ${outputPath}...`);
        const outBytes = write(dataset);

        fs.writeFileSync(outputPath, outBytes);
        console.log("Done.");
    } catch (e: any) {
        console.error(`Error converting file: ${e.message}`);
        process.exit(1);
    }
}

export { run };

// Run if main
import { fileURLToPath } from "url";
// ESM check - works in both ESM and CJS environments
// ESM check - works in both ESM and CJS environments
try {
    if (import.meta.url && process.argv[1] === fileURLToPath(import.meta.url)) {
        run().catch(err => {
            console.error(err);
            process.exit(1);
        });
    }
} catch {
    // In CJS environments, import.meta doesn't exist, so don't run
}

// CJS check for bundled environment
// @ts-ignore
if (
    typeof require !== "undefined" &&
    typeof module !== "undefined" &&
    require.main === module
) {
    run().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
