import { fullParse } from "../src/index";
import * as fs from "fs";
import * as path from "path";

// Use one of the known valid files
const TEST_FILE_PATH = path.resolve(
    process.cwd(),
    "test_data/patient/DICOM/18CBDD76"
);

function inspectData() {
    if (!fs.existsSync(TEST_FILE_PATH)) {
        console.error("Test file not found");
        return;
    }

    const fileBuffer = fs.readFileSync(TEST_FILE_PATH);
    const arrayBuffer = new Uint8Array(fileBuffer);

    console.log("Parsing file:", TEST_FILE_PATH);
    const dataset = fullParse(arrayBuffer);

    // iterate and print some interesting tags
    const interestingTags = [
        "x00100010", // PatientName
        "x00100020", // PatientID
        "x00080060", // Modality
        "x00280010", // Rows
        "x00280011", // Columns
        "x7fe00010", // PixelData
    ];

    const simplifiedOutput: any = {};

    for (const tag in dataset.dict) {
        const element = dataset.dict[tag];

        const val = element.Value;
        let displayValue: any;

        if (val instanceof Uint8Array) {
            displayValue = `[Uint8Array length=${val.length}]`;
        } else if (
            Array.isArray(val) &&
            val.length > 0 &&
            val[0] instanceof Uint8Array
        ) {
            displayValue = `[Array of Uint8Array count=${val.length}]`;
        } else {
            displayValue = val;
        }

        // Special handling for pixel data to ensure we show details
        if (tag === "x7fe00010") {
            simplifiedOutput[tag] = {
                vr: element.vr,
                length: element.length,
                valueType: "PixelData",
                details: displayValue,
            };
        } else {
            simplifiedOutput[tag] = {
                vr: element.vr,
                value: displayValue,
            };
        }
    }

    console.log(JSON.stringify(simplifiedOutput, null, 2));
}

inspectData();
