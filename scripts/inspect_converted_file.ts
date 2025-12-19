/**
 * Inspect a converted DICOM file to see what's wrong
 */

import * as fs from "fs";
import * as path from "path";
import "../src/codecs/auto-register";
import { parse as parser } from "../src/index";
import { extractPixelData } from "../src/utils/pixelDataExtractor";

const FILE =
    process.argv[2] ||
    path.resolve(__dirname, "../test_data/converted_codecs/RLE_Lossless.dcm");

async function main() {
    console.log(`Inspecting: ${FILE}\n`);

    const buffer = fs.readFileSync(FILE);
    const data = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
    );

    const dataset = parser(data);

    const rows = dataset.uint16("x00280010") || 0;
    const columns = dataset.uint16("x00280011") || 0;
    const samples = dataset.uint16("x00280002") || 1;
    const bits = dataset.uint16("x00280100") || 8;
    const transferSyntax = dataset.string("x00020010") || "Unknown";

    console.log(`Transfer Syntax: ${transferSyntax}`);
    console.log(`Dimensions: ${columns}x${rows}`);
    console.log(`Samples: ${samples}, Bits: ${bits}\n`);

    const pixelDataInfo = extractPixelData(dataset);
    if (!pixelDataInfo) {
        console.error("No pixel data found!");
        return;
    }

    console.log(`Pixel Data Info:`);
    console.log(`  Is Encapsulated: ${pixelDataInfo.isEncapsulated}`);
    console.log(`  Value type: ${typeof pixelDataInfo.Value}`);
    console.log(`  Is Array: ${Array.isArray(pixelDataInfo.Value)}`);

    if (pixelDataInfo.isEncapsulated) {
        const fragments = pixelDataInfo.fragmentArrays || [];
        console.log(`  Fragment count: ${fragments.length}`);
        for (let i = 0; i < Math.min(fragments.length, 3); i++) {
            console.log(`  Fragment ${i}: ${fragments[i]!.length} bytes`);
            if (i === 0 && fragments[i]!.length > 0) {
                console.log(
                    `    First 32 bytes: ${Array.from(
                        fragments[i]!.slice(0, 32)
                    )
                        .map(b => b.toString(16).padStart(2, "0"))
                        .join(" ")}`
                );
            }
        }
    } else {
        if (pixelDataInfo.Value instanceof Uint8Array) {
            console.log(
                `  Pixel data size: ${pixelDataInfo.Value.length} bytes`
            );
            console.log(
                `  First 32 bytes: ${Array.from(
                    pixelDataInfo.Value.slice(0, 32)
                )
                    .map(b => b.toString(16).padStart(2, "0"))
                    .join(" ")}`
            );
        }
    }
}

main().catch(console.error);
