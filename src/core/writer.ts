/**
 * DICOM Writer
 *
 * simple zero-dependency DICOM serializer.
 * Supports Explicit VR Little Endian (Part 10).
 */

import { DicomDataSet, DicomElement } from "./types";

const TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN = "1.2.840.10008.1.2";
const TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";
const TRANSFER_SYNTAX_EXPLICIT_VR_BIG_ENDIAN = "1.2.840.10008.1.2.2";

const PREAMBLE_LENGTH = 128;
const IMPLEMENTATION_CLASS_UID = "1.2.826.0.1.3680043.9.7433.1.1";
const IMPLEMENTATION_VERSION_NAME = "RADPARSER_2_0";

const encoder = new TextEncoder();

/**
 * VRs that use 32-bit length (Explicit VR)
 */
const LONG_VRS = new Set([
    "OB",
    "OD",
    "OF",
    "OL",
    "OW",
    "SQ",
    "UC",
    "UR",
    "UT",
    "UN",
]);

/**
 * VRs that use space padding (0x20)
 */
const SPACE_PADDED_VRS = new Set([
    "AE",
    "AS",
    "CS",
    "DA",
    "DS",
    "DT",
    "IS",
    "LO",
    "LT",
    "PN",
    "SH",
    "ST",
    "TM",
    "UC",
    "UR",
    "UT",
]);

export interface WriteOptions {
    /**
     * Transfer Syntax to write.
     * Supports:
     * - Implicit VR Little Endian (1.2.840.10008.1.2)
     * - Explicit VR Little Endian (1.2.840.10008.1.2.1) [Default]
     * - Explicit VR Big Endian (1.2.840.10008.1.2.2)
     */
    transferSyntax?: string;
}

interface WriteContext {
    explicitVR: boolean;
    littleEndian: boolean;
}

/**
 * Serialize a DicomDataSet to a Uint8Array (DICOM Part 10 file).
 */
export function write(
    dataset: DicomDataSet,
    options: WriteOptions = {}
): Uint8Array {
    const transferSyntax =
        options.transferSyntax || TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN;

    // Determine context from Transfer Syntax
    let explicitVR = true;
    let littleEndian = true;

    if (transferSyntax === TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN) {
        explicitVR = false;
        littleEndian = true;
    } else if (transferSyntax === TRANSFER_SYNTAX_EXPLICIT_VR_BIG_ENDIAN) {
        explicitVR = true;
        littleEndian = false;
    }

    const context: WriteContext = { explicitVR, littleEndian };

    // Pre-allocate chunks array
    const chunks: Uint8Array[] = [];

    // 1. Preamble (128 bytes 0x00)
    const preamble = new Uint8Array(PREAMBLE_LENGTH);
    chunks.push(preamble);

    // 2. DICM Prefix
    chunks.push(encoder.encode("DICM"));

    // 3. Separate Meta and Data
    const dataTags: string[] = [];
    const metaElements: Record<string, DicomElement> = {};

    for (const tag in dataset.dict) {
        const element = dataset.dict[tag];
        if (element && tag.startsWith("x0002")) {
            metaElements[tag] = element;
        } else if (element) {
            dataTags.push(tag);
        }
    }

    dataTags.sort();

    // 4. File Meta Information (Group 0002) - ALWAYS Explicit VR Little Endian
    // Ensure mandatory meta elements exist
    if (!metaElements["x00020001"]) {
        metaElements["x00020001"] = {
            vr: "OB",
            Value: new Uint8Array([0x00, 0x01]),
        };
    }
    if (!metaElements["x00020002"]) {
        const val = dataset.dict["x00080016"]?.Value;
        if (val) metaElements["x00020002"] = { vr: "UI", Value: val };
    }
    if (!metaElements["x00020003"]) {
        const val = dataset.dict["x00080018"]?.Value;
        if (val) metaElements["x00020003"] = { vr: "UI", Value: val };
    }
    // Update Transfer Syntax in Meta Header
    metaElements["x00020010"] = { vr: "UI", Value: transferSyntax };

    if (!metaElements["x00020012"]) {
        metaElements["x00020012"] = {
            vr: "UI",
            Value: IMPLEMENTATION_CLASS_UID,
        };
    }
    if (!metaElements["x00020013"]) {
        metaElements["x00020013"] = {
            vr: "SH",
            Value: IMPLEMENTATION_VERSION_NAME,
        };
    }

    // Serialize Meta Header (Always Explicit VR, Little Endian)
    const metaContext: WriteContext = { explicitVR: true, littleEndian: true };
    const metaChunks: Uint8Array[] = [];
    const sortedMetaTags = Object.keys(metaElements).sort();

    for (const tag of sortedMetaTags) {
        const element = metaElements[tag];
        if (element) {
            const chunk = serializeElement(tag, element, metaContext);
            if (chunk) metaChunks.push(chunk);
        }
    }

    // Add Group Length (0002,0000)
    const metaLength = metaChunks.reduce((acc, c) => acc + c.length, 0);
    const groupLengthElement: DicomElement = { vr: "UL", Value: metaLength };
    const groupLengthChunk = serializeElement(
        "x00020000",
        groupLengthElement,
        metaContext
    );
    if (groupLengthChunk) chunks.push(groupLengthChunk);

    chunks.push(...metaChunks);

    // 5. Data Elements
    for (const tag of dataTags) {
        const element = dataset.dict[tag];
        if (element) {
            const chunk = serializeElement(tag, element, context);
            if (chunk) chunks.push(chunk);
        }
    }

    return concatChunks(chunks);
}

// Optimized tag parsing - inline for better performance (cache adds overhead for small datasets)
export function concatChunks(chunks: Uint8Array[]): Uint8Array {
    let totalLength = 0;
    for (let i = 0; i < chunks.length; i++) {
        totalLength += chunks[i]!.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

function parseTagFast(tagHex: string): { group: number; elem: number } | null {
    if (tagHex.length !== 9 || !tagHex.startsWith("x")) return null;
    let group = 0;
    let elem = 0;
    for (let i = 1; i < 5; i++) {
        const c = tagHex.charCodeAt(i);
        group = (group << 4) | (c > 57 ? c - 87 : c - 48);
    }
    for (let i = 5; i < 9; i++) {
        const c = tagHex.charCodeAt(i);
        elem = (elem << 4) | (c > 57 ? c - 87 : c - 48);
    }
    return { group, elem };
}

export function serializeElement(
    tagHex: string,
    element: DicomElement,
    context: WriteContext
): Uint8Array | null {
    const tagParts = parseTagFast(tagHex);
    if (!tagParts) return null;
    const { group, elem } = tagParts;

    const vr = (element.vr || "UN").toUpperCase();
    let valueBytes: Uint8Array | null = null;

    // Determine actual VR to write (Implicit VR always implies implicit except sequences/encapsulated often handled specially, but pure Implicit VR doesn't write VR bytes)
    // Actually, Implicit VR means we don't write the VR chars, and length is always 32-bit.
    // BUT sequences and encapsulated data still have defined structures.

    const isLongVR = LONG_VRS.has(vr);

    // ... Value Encoding Logic (same as before) ...
    if (vr === "SQ" || (element.items && Array.isArray(element.items))) {
        // Sequences
        const itemChunks: Uint8Array[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (element.items || []) as any[];
        for (const item of items) {
            // Recursive Item Serialization
            const itemElementsIn = item.elements || {};
            // Items are predominantly CP-246/Implicit/Explicit agnostic (always FFFE E000 <len>)
            // BUT content of items must follow context
            const itemBody = serializeDataset(itemElementsIn, context);

            const itemHeader = new Uint8Array(8);
            const itemView = new DataView(itemHeader.buffer);
            itemView.setUint16(0, 0xfffe, context.littleEndian);
            itemView.setUint16(2, 0xe000, context.littleEndian);
            itemView.setUint32(4, itemBody.length, context.littleEndian);

            itemChunks.push(itemHeader);
            itemChunks.push(itemBody);
        }

        const seqDelim = new Uint8Array(8);
        const seqDelimView = new DataView(seqDelim.buffer);
        seqDelimView.setUint16(0, 0xfffe, context.littleEndian);
        seqDelimView.setUint16(2, 0xe0dd, context.littleEndian);
        seqDelimView.setUint32(4, 0, context.littleEndian);
        itemChunks.push(seqDelim);

        valueBytes = concatChunks(itemChunks);
    } else if (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (element as any).isEncapsulated &&
        (vr === "OB" || vr === "OW")
    ) {
        // Encapsulated Pixel Data
        const fragments = element.Value as Uint8Array[];
        const fragmentChunks: Uint8Array[] = [];
        for (const frag of fragments) {
            const itemHeader = new Uint8Array(8);
            const itemView = new DataView(itemHeader.buffer);
            itemView.setUint16(0, 0xfffe, context.littleEndian);
            itemView.setUint16(2, 0xe000, context.littleEndian);
            itemView.setUint32(4, frag.length, context.littleEndian);
            fragmentChunks.push(itemHeader);
            fragmentChunks.push(frag);
        }

        const seqDelim = new Uint8Array(8);
        const seqDelimView = new DataView(seqDelim.buffer);
        seqDelimView.setUint16(0, 0xfffe, context.littleEndian);
        seqDelimView.setUint16(2, 0xe0dd, context.littleEndian);
        seqDelimView.setUint32(4, 0, context.littleEndian);
        fragmentChunks.push(seqDelim);

        valueBytes = concatChunks(fragmentChunks);
    } else {
        // Standard Value Encoding
        // Reuse existing logic but respect Endianness for numbers
        if (element.Value instanceof Uint8Array) {
            // For OW (16-bit words) in Big Endian, we need to byte-swap the words
            // Pixel data is stored in Little Endian (native JS format)
            // For Big Endian files, we need to swap bytes of each 16-bit word
            if (vr === "OW" && !context.littleEndian) {
                if (element.Value.length % 2 !== 0) {
                    throw new Error(
                        "OW value length must be even for 16-bit words"
                    );
                }
                valueBytes = new Uint8Array(element.Value.length);
                const inputView = new DataView(
                    element.Value.buffer,
                    element.Value.byteOffset,
                    element.Value.byteLength
                );
                const outputView = new DataView(valueBytes.buffer);
                for (let i = 0; i < element.Value.length; i += 2) {
                    const word = inputView.getUint16(i, true); // Read as Little Endian (source)
                    outputView.setUint16(i, word, false); // Write as Big Endian (target)
                }
            } else {
                valueBytes = element.Value;
            }
        } else if (element.Value instanceof ArrayBuffer) {
            valueBytes = new Uint8Array(element.Value);
            // For OW, byte-swap if Big Endian
            if (vr === "OW" && !context.littleEndian) {
                if (valueBytes.length % 2 !== 0) {
                    throw new Error(
                        "OW value length must be even for 16-bit words"
                    );
                }
                const swapped = new Uint8Array(valueBytes.length);
                const inputView = new DataView(valueBytes.buffer);
                const outputView = new DataView(swapped.buffer);
                for (let i = 0; i < valueBytes.length; i += 2) {
                    const word = inputView.getUint16(i, true); // Read as Little Endian
                    outputView.setUint16(i, word, false); // Write as Big Endian
                }
                valueBytes = swapped;
            }
        } else if (
            Array.isArray(element.Value) &&
            element.Value[0] instanceof Uint8Array
        ) {
            // Concat arrays
            const totalLen = (element.Value as Uint8Array[]).reduce(
                (a, b) => a + b.length,
                0
            );
            valueBytes = new Uint8Array(totalLen);
            let off = 0;
            for (const v of element.Value as Uint8Array[]) {
                valueBytes.set(v, off);
                off += v.length;
            }
            // For OW, byte-swap if Big Endian
            if (vr === "OW" && !context.littleEndian) {
                if (valueBytes.length % 2 !== 0) {
                    throw new Error(
                        "OW value length must be even for 16-bit words"
                    );
                }
                const swapped = new Uint8Array(valueBytes.length);
                const inputView = new DataView(valueBytes.buffer);
                const outputView = new DataView(swapped.buffer);
                for (let i = 0; i < valueBytes.length; i += 2) {
                    const word = inputView.getUint16(i, true); // Read as Little Endian
                    outputView.setUint16(i, word, false); // Write as Big Endian
                }
                valueBytes = swapped;
            }
        } else if (
            [
                "US",
                "SS",
                "UL",
                "SL",
                "FL",
                "FD",
                "AT",
                "OW",
                "OL",
                "OD",
                "OF",
            ].includes(vr)
        ) {
            // Numeric handling with Endianness
            const val = element.Value;
            let nums: number[] = [];
            if (Array.isArray(val)) nums = val.map(Number);
            else if (typeof val === "number") nums = [val];
            else if (typeof val === "string")
                nums = val.split("\\").map(Number);

            let byteSize = 0;
            if (vr === "US" || vr === "SS" || vr === "OW") byteSize = 2;
            else if (
                vr === "UL" ||
                vr === "SL" ||
                vr === "FL" ||
                vr === "OF" ||
                vr === "AT"
            )
                byteSize = 4;
            else if (vr === "FD" || vr === "OD") byteSize = 8;

            if (nums.length > 0 && byteSize > 0) {
                valueBytes = new Uint8Array(nums.length * byteSize);
                const view = new DataView(valueBytes.buffer);
                for (let i = 0; i < nums.length; i++) {
                    const off = i * byteSize;
                    const n = nums[i];
                    if (n !== undefined) {
                        if (vr === "US" || vr === "OW")
                            view.setUint16(off, n, context.littleEndian);
                        else if (vr === "SS")
                            view.setInt16(off, n, context.littleEndian);
                        else if (vr === "UL" || vr === "AT" || vr === "OL")
                            view.setUint32(off, n, context.littleEndian);
                        else if (vr === "SL")
                            view.setInt32(off, n, context.littleEndian);
                        else if (vr === "FL" || vr === "OF")
                            view.setFloat32(off, n, context.littleEndian);
                        else if (vr === "FD" || vr === "OD")
                            view.setFloat64(off, n, context.littleEndian);
                    }
                }
            }
        }

        // String handling fallback (same as before)
        if (!valueBytes) {
            // ... Code from before for string encoding ...
            let valStr = "";
            // Retrieve string value logic (reused)
            const val = element.Value;
            if (val === undefined || val === null) valStr = "";
            else if (typeof val === "string") valStr = val;
            else if (typeof val === "number") valStr = String(val);
            else if (Array.isArray(val))
                valStr = val.join("\\"); // Simplified for brevity in replacement
            else if (val instanceof Date)
                valStr = val.toISOString(); // Simplified
            else valStr = String(val);

            // Better string handling that matches original:
            if (Array.isArray(val)) {
                if (val.length > 0 && typeof val[0] === "string")
                    valStr = val.join("\\");
            }

            if (valStr.length > 0) {
                valueBytes = encoder.encode(valStr);
                if (valueBytes.length % 2 !== 0) {
                    const padChar = SPACE_PADDED_VRS.has(vr) ? 0x20 : 0x00;
                    const padded = new Uint8Array(valueBytes.length + 1);
                    padded.set(valueBytes);
                    padded[valueBytes.length] = padChar;
                    valueBytes = padded;
                }
            } else {
                valueBytes = new Uint8Array(0);
            }
        }
    }

    if (!valueBytes) valueBytes = new Uint8Array(0);

    const valueLen = valueBytes.length;

    // Header Construction
    if (context.explicitVR) {
        const headerLen = isLongVR ? 12 : 8;
        const buffer = new Uint8Array(headerLen + valueLen);
        const view = new DataView(buffer.buffer);

        view.setUint16(0, group, context.littleEndian);
        view.setUint16(2, elem, context.littleEndian);

        buffer[4] = vr.charCodeAt(0);
        buffer[5] = vr.charCodeAt(1);

        if (isLongVR) {
            view.setUint16(6, 0, context.littleEndian);
            if (vr === "SQ" || (element as any).isEncapsulated) {
                view.setUint32(8, 0xffffffff, context.littleEndian);
            } else {
                // Length field must respect endianness for Big Endian files
                view.setUint32(8, valueLen, context.littleEndian);
            }
            if (valueLen > 0) buffer.set(valueBytes, 12);
        } else {
            // For short VR, length is 16-bit and should respect endianness
            view.setUint16(6, valueLen, context.littleEndian);
            if (valueLen > 0) buffer.set(valueBytes, 8);
        }
        return buffer;
    } else {
        // Implicit VR
        // Tag (4) + Length (4) + Value
        const buffer = new Uint8Array(8 + valueLen);
        const view = new DataView(buffer.buffer);

        view.setUint16(0, group, context.littleEndian);
        view.setUint16(2, elem, context.littleEndian);

        if (vr === "SQ" || (element as any).isEncapsulated) {
            view.setUint32(4, 0xffffffff, context.littleEndian);
        } else {
            view.setUint32(4, valueLen, context.littleEndian);
        }

        if (valueLen > 0) buffer.set(valueBytes, 8);
        return buffer;
    }
}

function serializeDataset(
    dict: Record<string, DicomElement>,
    context: WriteContext
): Uint8Array {
    const sortedTags = Object.keys(dict)
        .filter(tag => tag.startsWith("x"))
        .sort();
    const chunks: Uint8Array[] = [];
    for (const tag of sortedTags) {
        const element = dict[tag];
        if (element) {
            const chunk = serializeElement(tag, element, context);
            if (chunk) chunks.push(chunk);
        }
    }
    return concatChunks(chunks);
}
