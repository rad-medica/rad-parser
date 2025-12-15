import { parse } from "../src/index";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Use fileURLToPath to mimic __dirname in ESM if needed, but we are running with tsx which handles CommonJS/ESM interop well.
// But let's stick to simple path resolution.

const TEST_DATA_DIR = path.resolve(
    process.cwd(),
    "test_data/21197522-9_20251130013123Examenes/DICOM",
);
const OUTPUT_FILE = "parsed_dicom.json";

// Use a known file from the test data if no argument provided
const DEFAULT_FILE = "18CBDD76";

// Replacer function for JSON.stringify to handle BigInt and Buffers
const replacer = (key: string, value: any) => {
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (
        value instanceof Uint8Array ||
        (Array.isArray(value) &&
            value.length > 100 &&
            typeof value[0] === "number")
    ) {
        return `[Binary Data Length: ${value.length}]`;
    }
    // Also truncate long arrays of numbers that might not be Uint8Array but just regular arrays
    if (Array.isArray(value) && value.length > 100) {
        return `[Array Length: ${value.length}]`;
    }
    return value;
};

async function main() {
    const args = process.argv.slice(2);
    let filePath = args[0];

    if (!filePath) {
        if (fs.existsSync(TEST_DATA_DIR)) {
            filePath = path.join(TEST_DATA_DIR, DEFAULT_FILE);
            if (!fs.existsSync(filePath)) {
                // Fallback to first file in dir
                const files = fs
                    .readdirSync(TEST_DATA_DIR)
                    .filter((f) => !f.includes("Zone.Identifier"));
                if (files.length > 0) {
                    filePath = path.join(TEST_DATA_DIR, files[0]);
                }
            }
        }
    }

    if (!filePath || !fs.existsSync(filePath)) {
        console.error("Please provide a valid DICOM file path.");
        process.exit(1);
    }

    try {
        const fileData = fs.readFileSync(filePath);
        const dataset = parse(fileData);

        // Recursive function to sanitize elements
        const sanitizeElement = (element: any): any => {
            const sanitized: any = {
                vr: element.vr || element.VR,
                value: element.Value ?? element.value,
                length: element.length ?? element.Length,
            };

            // If value is an array of items (like in SQ), sanitize them too
            if (Array.isArray(sanitized.value)) {
                sanitized.value = sanitized.value.map((item: any) => {
                    // If item is a dataset (has dict or just an object of elements)
                    // In this parser, sequences are often arrays of datasets (SequenceItems)
                    if (item && typeof item === "object") {
                        // If it has a dict, it's a DicomDataSet, otherwise might be a plain object
                        const dict = item.dict || item;
                        const sanitizedItem: Record<string, any> = {};
                        Object.keys(dict).forEach((k) => {
                            if (/^[0-9a-fA-F]{4},[0-9a-fA-F]{4}$/.test(k)) {
                                sanitizedItem[k] = sanitizeElement(dict[k]);
                            }
                        });
                        // If it was just a raw object without dict, assume we mapped it to sanitizedItem
                        // But usually Sequence items are objects where keys are tags.
                        return sanitizedItem;
                    }
                    return item;
                });
            }
            return sanitized;
        };

        // Filter keys to only keep the comma-separated format (canonical DICOM)
        const filteredDict: Record<string, any> = {};
        if (dataset && dataset.dict) {
            Object.keys(dataset.dict).forEach((key) => {
                // Keep only keys that match the pattern GGGG,EEEE (hex digits with comma)
                if (/^[0-9a-fA-F]{4},[0-9a-fA-F]{4}$/.test(key)) {
                    filteredDict[key] = sanitizeElement(dataset.dict[key]);
                }
            });
        }

        const jsonOutput = JSON.stringify(filteredDict, replacer, 2);
        fs.writeFileSync(OUTPUT_FILE, jsonOutput);
        console.log(`Successfully parsed DICOM file: ${filePath}`);
        console.log(`Output written to ${OUTPUT_FILE}`);
    } catch (error) {
        console.error("Error parsing file:", error);
        process.exit(1);
    }
}

main();
