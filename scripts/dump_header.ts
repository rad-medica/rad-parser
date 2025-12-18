import * as fs from "fs";
import * as path from "path";
import { parse } from "../src/core/parser";

const filePath = path.resolve("test_data/REAL/DICOM/08FD35A0");

async function main() {
    const buffer = fs.readFileSync(filePath);
    // Cast buffer to Uint8Array for the parser
    const data = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
    );

    try {
        const dataset = parse(data);
        console.log("Transfer Syntax:", dataset.dict["x00020010"]?.Value);
        console.log("SOP Class UID:", dataset.dict["x00080016"]?.Value);
        console.log("Rows:", dataset.dict["x00280010"]?.Value);
        console.log("Columns:", dataset.dict["x00280011"]?.Value);
        console.log("Bits Allocated:", dataset.dict["x00280100"]?.Value);
        console.log("Bits Stored:", dataset.dict["x00280101"]?.Value);
        console.log("High Bit:", dataset.dict["x00280102"]?.Value);
        console.log("Pixel Representation:", dataset.dict["x00280103"]?.Value);
        console.log("Samples per Pixel:", dataset.dict["x00280002"]?.Value);
        console.log(
            "Photometric Interpretation:",
            dataset.dict["x00280004"]?.Value
        );

        const pixelData = dataset.dict["x7FE00010"];
        if (pixelData) {
            console.log("Pixel Data VR:", pixelData.vr);
            console.log(
                "Pixel Data Length:",
                pixelData.Value instanceof Uint8Array
                    ? pixelData.Value.length
                    : "N/A"
            );
        }
    } catch (e) {
        console.error("Error parsing:", e);
    }
}

main();
