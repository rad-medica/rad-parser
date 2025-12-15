import { fullParse } from "../src/index";
import dcmjs from "dcmjs";
import * as fs from "fs";
import * as path from "path";

// Use one of the known valid files
const TEST_FILE_PATH = path.resolve(
    process.cwd(),
    "test_data/patient/DICOM/18CBDD76",
);

function compareOutputs() {
    if (!fs.existsSync(TEST_FILE_PATH)) {
        console.error("Test file not found");
        return;
    }

    const fileBuffer = fs.readFileSync(TEST_FILE_PATH);

    // rad-parser uses Uint8Array
    const radInput = new Uint8Array(fileBuffer);
    // dcmjs uses ArrayBuffer
    const dcmjsInput = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
    );

    console.log("Parsing file:", TEST_FILE_PATH);

    // Parse
    const radDataset = fullParse(radInput);
    const dcmjsDataset = dcmjs.data.DicomMessage.readFile(dcmjsInput);

    // Define tags to compare (Tag ID mapped to name for clarity)
    const tagsToCompare = {
        "00080060": "Modality",
        "00100010": "PatientName",
        "00100020": "PatientID",
        "0020000D": "StudyInstanceUID",
        "00280010": "Rows",
        "00280011": "Columns",
        "00280100": "BitsAllocated",
        "7FE00010": "PixelData",
    };

    const comparison: any = {};

    for (const [tagId, name] of Object.entries(tagsToCompare)) {
        const radKey = "x" + tagId.toLowerCase();

        // Use accessor for rad-parser if available to see if it normalizes
        // But for raw comparison, we look at internal .dict
        const radElement = radDataset.dict[radKey];
        const radValue = radElement ? radElement.Value : undefined;

        // dcmjs lookup
        const dcmjsElement = dcmjsDataset.dict[tagId];
        const dcmjsValue = dcmjsElement ? dcmjsElement.Value : undefined;

        // Formatting helper
        const formatValue = (val: any) => {
            if (val === undefined) return "undefined";
            if (val instanceof Uint8Array) return `[Uint8Array ${val.length}]`;
            if (val instanceof ArrayBuffer)
                return `[ArrayBuffer ${val.byteLength}]`;
            if (Array.isArray(val)) {
                // Check if it's an array of binary buffers
                if (
                    val.length > 0 &&
                    (val[0] instanceof Uint8Array ||
                        val[0] instanceof ArrayBuffer)
                ) {
                    const total = val.reduce(
                        (acc, v) => acc + (v.byteLength || v.length),
                        0,
                    );
                    return `[Array(${val.length}) Binary Total=${total}]`;
                }
                if (val.length === 1) return JSON.stringify(val[0]);
                return JSON.stringify(val);
            }
            // Check for string that might be garbage (binary read as string)
            if (typeof val === "string" && val.length < 100) {
                // peek if it has non-printable characters
                if (/[\x00-\x08\x0E-\x1F]/.test(val)) {
                    // return hex representation
                    return `RawString(Hex): ${Buffer.from(val, "binary").toString("hex")}`;
                }
            }
            return JSON.stringify(val);
        };

        let radDisplay = formatValue(radValue);
        let dcmjsDisplay = formatValue(dcmjsValue);

        // Calculate match
        let match = false;

        // Special logic for pixel data
        if (name === "PixelData") {
            // sizes
            const len1 = radValue?.length || radValue?.byteLength || 0;
            const len2 =
                dcmjsValue?.length ||
                dcmjsValue?.byteLength ||
                (Array.isArray(dcmjsValue)
                    ? dcmjsValue.reduce((a: any, b: any) => a + b.byteLength, 0)
                    : 0);

            radDisplay = `Binary (Size: ${len1})`;
            dcmjsDisplay = `Binary (Size: ${len2})`;
            match = len1 === len2 && len1 > 0;
        } else {
            // simple comparison
            match = radDisplay === dcmjsDisplay;

            // Try to reconcile types if mismatch
            // e.g., RadParser RawString vs Dcmjs Number
            if (
                !match &&
                dcmjsElement &&
                (dcmjsElement.vr === "US" || dcmjsElement.vr === "SS")
            ) {
                // RadParser likely read as string. Dcmjs as number.
                // We can manually decode RadParser string to see if it matches
                if (typeof radValue === "string") {
                    // assume little endian 2 bytes
                    const buf = Buffer.from(radValue, "binary");
                    if (buf.length === 2) {
                        const num = buf.readUInt16LE(0);
                        if (num === dcmjsValue) {
                            radDisplay += ` (Decoded: ${num})`;
                            match = true;
                        }
                    }
                }
            }
        }

        comparison[name] = {
            Tag: tagId,
            VR: dcmjsElement?.vr || radElement?.vr,
            RadParser: radDisplay,
            Dcmjs: dcmjsDisplay,
            Match: match,
        };
    }

    console.log(JSON.stringify(comparison, null, 2));
}

compareOutputs();
