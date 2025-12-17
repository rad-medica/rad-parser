# Handling Encapsulated Documents (PDF, ECG, etc.)

DICOM is not just for images. It is a container format that can store many different types of data, including raw documents like PDFs or structured reports like ECG waveforms. This guide provides examples of how to extract this data using `rad-parser`.

---

## Extracting an Encapsulated PDF

Encapsulated PDF documents are typically stored in the `Encapsulated Document` tag `(0042,0011)`. The value of this tag is the raw byte stream of the PDF file itself.

The process involves two simple steps:

1. Parse the DICOM file to access the dataset.
2. Get the value of the `Encapsulated Document` tag.
3. Save the resulting `Uint8Array` to a `.pdf` file.

#### **Example: Extracting a PDF in Node.js**

```typescript
import { parse } from "rad-parser";
import * as fs from "fs";
import * as path from "path";

function extractEncapsulatedPdf(dicomFilePath: string, outputDir: string) {
    try {
        // 1. Read and parse the DICOM file
        const dicomBytes = new Uint8Array(fs.readFileSync(dicomFilePath));
        const dataset = parse(dicomBytes, { type: "full" });

        if (!dataset) {
            throw new Error("Failed to parse DICOM file.");
        }

        // 2. Access the Encapsulated Document tag
        const encapsulatedDocElement = dataset.elements["x00420011"];
        if (!encapsulatedDocElement || !encapsulatedDocElement.Value) {
            console.log("This DICOM file does not contain an encapsulated document.");
            return;
        }

        // The value is the raw PDF byte stream
        const pdfBytes = encapsulatedDocElement.Value as Uint8Array;

        // 3. Save the bytes to a .pdf file
        const outputFileName = `${path.basename(dicomFilePath)}.pdf`;
        const outputPath = path.join(outputDir, outputFileName);
        fs.writeFileSync(outputPath, pdfBytes);

        console.log(`Successfully extracted and saved PDF to ${outputPath}`);
    } catch (err) {
        console.error(`An error occurred: ${err.message}`);
    }
}

// Example usage:
// extractEncapsulatedPdf('path/to/your/dicom_with_pdf.dcm', './output');
```

---

## Accessing ECG Waveform Data

ECG (Electrocardiography) and other waveform data are stored in a more complex structure within the `Waveform Sequence` tag `(5400,1000)`. Each item in this sequence represents a channel of waveform data.

Key tags inside each sequence item include:

- `(5400,1010) Waveform Data`: The actual waveform samples, often stored as a `Uint8Array` or `Uint16Array`.
- `(5400,0105) Channel Sensitivity`: The sensitivity of the channel.
- `(003A,0210) Channel Sample Skew`: The time skew of the samples.

`rad-parser` gives you access to this raw data, but interpreting and visualizing it requires knowledge of the specific encoding and multiplexing scheme defined in the DICOM standard (Part 3, Annex C).

#### **Example: Accessing Raw Waveform Data**

This example shows how to access the sequence and the raw data within it.

```typescript
import { parse } from "rad-parser";
import * as fs from "fs";

function inspectEcgData(dicomFilePath: string) {
    try {
        // 1. Read and parse the DICOM file
        const dicomBytes = new Uint8Array(fs.readFileSync(dicomFilePath));
        const dataset = parse(dicomBytes, { type: "full" });

        // 2. Access the Waveform Sequence
        const waveformSequence = dataset.elements["x54001000"];
        if (!waveformSequence || !Array.isArray(waveformSequence.Value)) {
            console.log("This DICOM file does not contain a Waveform Sequence.");
            return;
        }

        console.log(`Found ${waveformSequence.Value.length} channels in the Waveform Sequence.`);

        // 3. Iterate through each channel in the sequence
        waveformSequence.Value.forEach((channel, index) => {
            console.log(`\n--- Channel ${index + 1} ---`);

            // The 'channel' is itself a DicomDataSet for the sequence item
            const channelSensitivity = channel.float("x54000105");
            const waveformDataElement = channel.elements["x54001010"];

            if (channelSensitivity) {
                console.log(`  Channel Sensitivity: ${channelSensitivity}`);
            }

            if (waveformDataElement && waveformDataElement.Value) {
                const waveformBytes = waveformDataElement.Value as Uint8Array;
                console.log(`  Waveform Data VR: ${waveformDataElement.vr}`);
                console.log(`  Waveform Data Size: ${waveformBytes.length} bytes`);
                // Further processing would involve interpreting these bytes as 16-bit integers,
                // applying sensitivity and baseline corrections, and plotting the results.
            }
        });
    } catch (err) {
        console.error(`An error occurred: ${err.message}`);
    }
}

// Example usage:
// inspectEcgData('path/to/your/dicom_ecg.dcm');
```
