# Rad-Parser CLI Reference

The `rad` CLI tool provides a set of powerful utilities for inspecting, manipulating, and converting DICOM files directly from the command line.

## Installation

The CLI is included with the `rad-parser` package.

```bash
npm install -g rad-parser
# OR run via npx
npx rad-parser [command]
```

## Global Options

-   `--help`: Show help for any command.

---

## Commands

### `dump`

Parses a DICOM file and prints a structured dump of all data elements, including tags, VRs (Value Representations), and values.

**Usage:**

```bash
rad dump <file>
```

**Output:**

```text
(0008,0016) | UI | 1.2.840.10008.5.1.4.1.1.7 [Secondary Capture Image Storage]
(0008,0018) | UI | 1.2.3.4.5.6.7
(0010,0010) | PN | Doe^John
(7fe0,0010) | OB | <Buffer length=512>
```

-   **Tag**: The group and element in hex `(gggg,eeee)`.
-   **VR**: The 2-letter Value Representation (e.g., `PN`, `UI`, `SQ`).
-   **Value**: The interpreted value. Long binary data is summarized.

---

### `transcode`

Transcodes a DICOM file from one Transfer Syntax to another. This involves decoding the pixel data (if compressed) and re-encoding it into the target format.

**Usage:**

```bash
rad transcode <input_file> <output_file> --format <format_alias_or_uid>
```

**Parameters:**

-   `<input_file>`: Path to the source DICOM file.
-   `<output_file>`: Path where the transcoded DICOM file will be saved.
-   `--format`: The target format alias or Transfer Syntax UID.

**Supported Format Aliases:**

-   `native` / `implicit`: Implicit VR Little Endian (1.2.840.10008.1.2)
-   `explicit`: Explicit VR Little Endian (1.2.840.10008.1.2.1)
-   `rle`: RLE Lossless (1.2.840.10008.1.2.5)
-   `jpeg`: JPEG Baseline (Process 1) (1.2.840.10008.1.2.4.50)
-   `j2k`: JPEG 2000 Lossless (1.2.840.10008.1.2.4.90)
-   `jpegls`: JPEG-LS Lossless (1.2.840.10008.1.2.4.80)

**Examples:**

1. **Compress to RLE:**

    ```bash
    rad transcode study.dcm output_rle.dcm --format rle
    ```

2. **Decompress to Native (Implicit Little Endian):**

    ```bash
    rad transcode compressed.dcm output_native.dcm --format native
    ```

3. **Convert to JPEG 2000:**
    ```bash
    rad transcode explicit.dcm output_j2k.dcm --format j2k
    ```

**Notes:**

-   Automatically handles pixel data extraction and frame fragmentation for encapsulated formats.
-   Updates the `TransferSyntaxUID` (0002,0010) in the File Meta Information.
-   Updates `PixelData` (7FE0,0010) structure (Native vs. Encapsulated/Sequence-like).

---

### `image`

Exports one or all frames from a DICOM file to standard image formats (PNG, JPEG).

**Usage:**

```bash
rad image <input_file> <output_path> --format <png|jpeg> [--frame <index>]
```

**Parameters:**

-   `<input_file>`: Path to the DICOM file.
-   `<output_path>`: Path to save the image (e.g., `image.png`).
-   `--format`: Output format (`png` or `jpeg`). Default is inferred from extension.
-   `--frame`: (Optional) 0-based index of the frame to export. Default is 0.

**Examples:**

1. **Export the first frame to PNG:**

    ```bash
    rad image scan.dcm output.png
    ```

2. **Export the 10th frame to JPEG:**
    ```bash
    rad image multiframe.dcm frame_10.jpg --frame 9
    ```

**Behind the Scenes:**

-   Parses the DICOM file.
-   Decodes the pixel data (using Wasm codecs if needed).
-   Applies basic photometric interpretation (Monochrome -> Grayscale, RGB -> RGB).
-   Encodes the pixel buffer to the target image format.

---

### Troubleshooting

-   **"Missing Transfer Syntax UID"**: The input file might be missing the File Meta Information header. Try converting it with another tool first if possible, or ensure it's a valid Part 10 file.
-   **"Codec not supported"**: Ensure you have the necessary Wasm modules available. `rad-parser` bundles essential Wasm codecs, but some formats might require additional initialization or are currently read-only.
