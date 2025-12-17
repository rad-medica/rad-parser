# Encoding Pixel Data Examples

This guide demonstrates how to take a raw pixel data buffer and encode it into a compressed format, such as JPEG 2000, before writing it to a new DICOM file.

The general workflow for encoding is:

1.  Start with a `DicomDataSet`, either by parsing an existing file or creating one from scratch.
2.  Have a raw, uncompressed pixel data buffer that you want to encode.
3.  Use a configured encoder to compress the pixel data.
4.  Update the `DicomDataSet` with the newly compressed pixel data fragments. This involves:
    - Setting the `(7FE0,0010)` Pixel Data value to the new fragments.
    - Changing the `(7FE0,0010)` VR to `OB` (for encapsulated data).
    - Updating the `(0002,0010)` Transfer Syntax UID to match the compressed format.
5.  Call `write()` to serialize the updated dataset into a new DICOM file buffer.

---

## Example: Encoding to JPEG 2000

This example shows how to encode a raw pixel buffer to JPEG 2000 and save the result. It uses a **dummy encoder function** for demonstration purposes. In a real application, you would use a library like `openjpeg-js` to perform the actual compression.

```typescript
import { parse, write, registry, Jpeg2000Decoder } from "rad-parser";
import * as fs from "fs";

// --- Dummy Encoder Setup ---
// In a real project, this function would come from a library like openjpeg-js
// and perform actual JPEG 2000 compression.
async function dummyJpeg2000Encode(
    rawPixelData: Uint8Array,
    options: { width: number; height: number }
): Promise<Uint8Array[]> {
    console.log(`"Encoding" a ${options.width}x${options.height} image to JPEG 2000...`);
    // This would return an array of one or more Uint8Array fragments.
    // For simplicity, we return a single fragment representing the "compressed" data.
    const fakeCompressedData = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    return [fakeCompressedData];
}

// We need to register an encoder. We can use the Jpeg2000Decoder adapter class,
// passing our dummy encoder function to its constructor.
const TARGET_TS = "1.2.840.10008.1.2.4.90"; // JPEG 2000 Image Compression (Lossless Only)
const j2kEncoder = new Jpeg2000Decoder(undefined, (pixelData, ts, w, h, s, b) => {
    return dummyJpeg2000Encode(pixelData, { width: w, height: h });
});
registry.register(j2kEncoder);
// --- End Dummy Encoder Setup ---

async function createCompressedDicomFile(
    baseDataset: DicomDataSet,
    rawPixelData: Uint8Array,
    outputFile: string
) {
    // 1. Get the registered encoder for our target transfer syntax
    const encoder = await registry.getEncoder(TARGET_TS);
    if (!encoder || !encoder.encode) {
        throw new Error(`No encoder registered for ${TARGET_TS}`);
    }

    // 2. Get necessary metadata from the base dataset
    const encodeOptions = {
        width: baseDataset.uint16("x00280011") || 0,
        height: baseDataset.uint16("x00280010") || 0,
        samplesPerPixel: baseDataset.uint16("x00280002") || 1,
        bitsAllocated: baseDataset.uint16("x00280100") || 8,
    };

    // 3. Encode the raw pixel data
    const encodedFragments = await encoder.encode(
        rawPixelData,
        TARGET_TS,
        encodeOptions.width,
        encodeOptions.height,
        encodeOptions.samplesPerPixel,
        encodeOptions.bitsAllocated
    );

    // 4. Update the dataset
    // Get the pixel data element, or create it if it doesn't exist
    let pixelDataElement = baseDataset.elements["x7fe00010"];
    if (!pixelDataElement) {
        pixelDataElement = { vr: "OB", Value: [] };
        baseDataset.dict["x7fe00010"] = pixelDataElement;
        baseDataset.elements["x7fe00010"] = pixelDataElement;
    }

    // Set the new value, VR, and length
    pixelDataElement.Value = encodedFragments;
    pixelDataElement.vr = "OB"; // Encapsulated data must have OB VR
    pixelDataElement.length = 0xffffffff; // Undefined length for sequences of fragments

    // IMPORTANT: Update the Transfer Syntax UID
    baseDataset.dict["x00020010"].Value = [TARGET_TS];

    // 5. Write the modified dataset to a file
    console.log(`Writing compressed DICOM file to ${outputFile}...`);
    const outputBytes = write(baseDataset);
    fs.writeFileSync(outputFile, outputBytes);
    console.log("Done.");
}

// Example Usage:
// This assumes you have an uncompressed DICOM file to use as a base.
/*
try {
    const baseFileBytes = fs.readFileSync('uncompressed.dcm');
    const baseDataset = parse(baseFileBytes, { type: 'full' });
    
    // Assume we have some raw pixel data to encode
    const width = baseDataset.uint16('x00280011') || 0;
    const height = baseDataset.uint16('x00280010') || 0;
    const rawPixelData = new Uint8Array(width * height * 2); // e.g., for 16-bit grayscale

    await createCompressedDicomFile(baseDataset, rawPixelData, 'compressed.dcm');
} catch (err) {
    console.error(err);
}
*/
```
