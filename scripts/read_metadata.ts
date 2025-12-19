import * as fs from "fs";
import * as path from "path";
import { parse as parser } from "../src/index";

const FILE_PATH = path.join("test_data", "codec_test", "Implicit_VR_LE.dcm");

function main() {
    if (!fs.existsSync(FILE_PATH)) {
        console.error(`File not found: ${FILE_PATH}`);
        return;
    }
    const data = fs.readFileSync(FILE_PATH);
    const dataset = parser(data) as any;

    console.log("BitsAllocated:", dataset.uint16("x00280100"));
    console.log("BitsStored:", dataset.uint16("x00280101"));
    console.log("HighBit:", dataset.uint16("x00280102"));
    console.log("Rows:", dataset.uint16("x00280010"));
    console.log("Columns:", dataset.uint16("x00280011"));
    console.log("SamplesPerPixel:", dataset.uint16("x00280002"));
    console.log("PhotometricInterpretation:", dataset.string("x00280004"));
    console.log("TransferSyntax:", dataset.string("x00020010"));
}

main();
