import { write } from "../src/core/writer";
import { DicomDataSet } from "../src/core/types";
import { writeFileSync } from "fs";

// Create a simple DICOM dataset (Secondary Capture Image)
const width = 256;
const height = 256;
const pixelData = new Uint8Array(width * height);

// Create a gradient pattern
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        pixelData[y * width + x] = (x + y) % 256;
    }
}

const dataset: DicomDataSet = {
    // Methods (mocked/minimal for write)
    string: () => undefined,
    uint16: () => undefined,
    int16: () => undefined,
    floatString: () => undefined,
    dict: {
        // SOP Class UID (Secondary Capture)
        x00080016: { vr: "UI", Value: ["1.2.840.10008.5.1.4.1.1.7"] },
        // SOP Instance UID
        x00080018: { vr: "UI", Value: ["1.2.3.4.5.6.7"] },
        // Study Instance UID
        x0020000d: { vr: "UI", Value: ["1.2.3.4.5"] },
        // Series Instance UID
        x0020000e: { vr: "UI", Value: ["1.2.3.4.5.1"] },
        // Modality
        x00080060: { vr: "CS", Value: ["OT"] },

        // Image Pixel Module
        x00280002: { vr: "US", Value: [1] }, // SamplesPerPixel
        x00280004: { vr: "CS", Value: ["MONOCHROME2"] }, // Photometric
        x00280010: { vr: "US", Value: [height] }, // Rows
        x00280011: { vr: "US", Value: [width] }, // Columns
        x00280100: { vr: "US", Value: [8] }, // BitsAllocated
        x00280101: { vr: "US", Value: [8] }, // BitsStored
        x00280102: { vr: "US", Value: [7] }, // HighBit
        x00280103: { vr: "US", Value: [0] }, // PixelRepresentation (Unsigned)

        // Pixel Data
        x7fe00010: { vr: "OB", Value: pixelData },
    },
    elements: {}, // unused by write
};

// Write to file
const buffer = write(dataset, { transferSyntax: "1.2.840.10008.1.2.1" });
writeFileSync("test_cli.dcm", buffer);
console.log("Created test_cli.dcm");
