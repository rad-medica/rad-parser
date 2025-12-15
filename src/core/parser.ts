/**
 * RAD-Parser: In-House DICOM Parser Implementation
 *
 * A lightweight, performant, self-contained DICOM parser with no external dependencies.
 * Designed for safety and efficiency.
 *
 * Modular architecture:
 * - SafeDataView: Safe byte reading
 * - vrDetection: Implicit VR detection
 * - valueParsers: Specialized value parsing (PN, DA, TM, etc.)
 * - sequenceParser: Sequence parsing
 * - dictionary: Tag dictionary and lookup
 */

import { registry } from "./registry";
import { createParseError, DicomParseError } from "./errors";
import { isPrivateTag } from "../utils/dictionary";
import { extractPixelDataFromView } from "../utils/pixelData";
import { parseDSWasm, parseISWasm, parsePNWasm } from "./wasm-opt";
import { SafeDataView } from "../utils/SafeDataView";
import { parseSequence } from "../utils/sequenceParser";
import { formatTagWithComma, normalizeTag } from "../utils/tagUtils";
import type {
    DicomDataSet,
    DicomElement,
    ShallowDicomDataSet,
    PixelDataInfo,
} from "./types";
import { parseValueByVR } from "../utils/valueParsers";
import {
    detectVR,
    detectVRForPrivateTag,
    requiresExplicitLength,
} from "../utils/vrDetection";

/**
 * Transfer syntax constants
 */
const TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN = "1.2.840.10008.1.2";
const TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";
const TRANSFER_SYNTAX_EXPLICIT_VR_BIG_ENDIAN = "1.2.840.10008.1.2.2";

/**
 * Pre-computed hex string lookup table (0x0000 to 0xFFFF)
 * Eliminates toString(16).padStart() overhead in hot paths
 */
const HEX_TABLE: string[] = new Array(65536);
for (let i = 0; i < 65536; i++) {
    HEX_TABLE[i] = i.toString(16).padStart(4, "0");
}

/**
 * Fast tag formatting using pre-computed hex table
 */
function formatTag(group: number, element: number): string {
    return `x${HEX_TABLE[group]}${HEX_TABLE[element]}`;
}

/**
 * Parse result with metadata
 */
export interface ParseResult {
    dataset: DicomDataSet;
    transferSyntax: string;
    characterSet: string;
}

/**
 * Extract transfer syntax from DICOM file without full parsing
 * Useful for quick format detection
 *
 * @param byteArray - The DICOM file as a Uint8Array
 * @returns Transfer syntax UID or undefined if not found
 */
export function extractTransferSyntax(
    byteArray: Uint8Array,
): string | undefined {
    try {
        let buffer: ArrayBuffer;
        if (byteArray.buffer instanceof ArrayBuffer) {
            buffer = byteArray.buffer.slice(
                byteArray.byteOffset,
                byteArray.byteOffset + byteArray.byteLength,
            );
        } else {
            buffer = new ArrayBuffer(byteArray.byteLength);
            const newView = new Uint8Array(buffer);
            newView.set(byteArray);
        }

        const view = new SafeDataView(buffer);
        const detection = detectDicomFormat(view, buffer);
        return detection.transferSyntax;
    } catch {
        return undefined;
    }
}

/**
 * Check if byte array appears to be a valid DICOM file
 *
 * @param byteArray - The file data as a Uint8Array
 * @returns True if file appears to be valid DICOM
 */
export function canParse(byteArray: Uint8Array): boolean {
    try {
        if (byteArray.length < 8) {
            return false;
        }

        // Check for DICM magic string (Part 10 file)
        if (byteArray.length >= 132) {
            const magic = new Uint8Array(
                byteArray.buffer,
                byteArray.byteOffset + 128,
                4,
            );
            const magicString = String.fromCharCode(...magic);
            if (magicString === "DICM") {
                return true;
            }
        }

        // Check if starts with valid DICOM tag (group should be reasonable)
        const view = new DataView(
            byteArray.buffer,
            byteArray.byteOffset,
            Math.min(byteArray.length, 8),
        );
        const group = view.getUint16(0, true); // Try little endian first
        if (group <= 0xffff && group !== 0x0000) {
            // Valid group number (not 0x0000 which is reserved)
            return true;
        }

        // Try big endian
        const groupBE = view.getUint16(0, false);
        if (groupBE <= 0xffff && groupBE !== 0x0000) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

export interface ParseOptions {
    skipPixelData?: boolean;
    /**
     * Optional tags to filter (include only these).
     * Note: This filters at the root level.
     */
    filterTags?: string[];
    /**
     * Custom plugin to decode pixel data.
     * If provided, this function is called when Pixel Data (7FE0,0010) is encountered.
     */
    pixelDataPlugin?: (
        element: DicomElement,
        transferSyntax: string,
    ) => unknown;
}

/**
 * Parse DICOM file with metadata
 *
 * @param byteArray - The DICOM file as a Uint8Array
 * @param options - Parse options
 * @returns Parse result with dataset and metadata
 */
export function parseWithMetadata(
    byteArray: Uint8Array,
    options: ParseOptions = {},
): ParseResult {
    // Ensure we have an ArrayBuffer (not SharedArrayBuffer)
    let buffer: ArrayBuffer;
    if (byteArray.buffer instanceof ArrayBuffer) {
        buffer = byteArray.buffer.slice(
            byteArray.byteOffset,
            byteArray.byteOffset + byteArray.byteLength,
        );
    } else {
        // Copy to new ArrayBuffer if SharedArrayBuffer
        buffer = new ArrayBuffer(byteArray.byteLength);
        const newView = new Uint8Array(buffer);
        newView.set(byteArray);
    }

    if (buffer.byteLength < 8) {
        throw createParseError(
            "File too small to be a valid DICOM file",
            undefined,
            0,
        );
    }

    const view = new SafeDataView(buffer);

    // Detect DICOM format and transfer syntax
    let detection: FormatDetection;
    try {
        detection = detectDicomFormat(view, buffer);
    } catch (error) {
        throw createParseError(
            `Format detection failed - ${error instanceof Error ? error.message : "Unknown error"}`,
            undefined,
            view.getPosition(),
            error instanceof Error ? error : undefined,
        );
    }

    // Set endianness and position for main parsing
    view.setEndianness(detection.littleEndian);
    view.setPosition(detection.offset);

    // Parse all data elements
    let characterSet = detection.characterSet;
    const parseContext: ParseContext = {
        explicitVR: detection.explicitVR,
        littleEndian: detection.littleEndian,
        characterSet: characterSet,
        transferSyntax: detection.transferSyntax,
        skipPixelData: options.skipPixelData,
        filterTags: options.filterTags
            ? new Set(options.filterTags.map((t) => normalizeTag(t)))
            : undefined,
        pixelDataPlugin: options.pixelDataPlugin,
    };

    let dict: Record<string, DicomElement>;
    let detectedCharacterSet: string | undefined;

    try {
        const parseResult = parseDataElements(view, parseContext);
        dict = parseResult.dict;
        detectedCharacterSet = parseResult.detectedCharacterSet;
    } catch (error) {
        // If it's already a DicomParseError, it usually has tag/offset context
        if (error instanceof DicomParseError) {
            throw error;
        }
        throw createParseError(
            `Data element parsing failed - ${error instanceof Error ? error.message : "Unknown error"}`,
            undefined,
            view.getPosition(),
            error instanceof Error ? error : undefined,
        );
    }

    // Update character set if found in dataset (tag 0008,0005)
    if (detectedCharacterSet) {
        characterSet = detectedCharacterSet;
        // Update context for any remaining parsing
        parseContext.characterSet = characterSet;
    }

    // Create accessor methods
    const dataset = createDataSet(dict);

    if (
        !dataset ||
        typeof dataset !== "object" ||
        !dataset.dict ||
        typeof dataset.string !== "function"
    ) {
        throw createParseError("Failed to create valid dataset structure");
    }

    return {
        dataset,
        transferSyntax: detection.transferSyntax,
        characterSet: characterSet,
    };
}

/**
 * DICOM format detection result
 */
interface FormatDetection {
    offset: number;
    isDicomPart10: boolean;
    transferSyntax: string;
    explicitVR: boolean;
    littleEndian: boolean;
    characterSet: string;
}

/**
 * Detect DICOM format and transfer syntax
 */
function detectDicomFormat(
    view: SafeDataView,
    buffer: ArrayBuffer,
): FormatDetection {
    let offset = 0;
    let isDicomPart10 = false;
    let transferSyntax = TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN;
    let explicitVR = true;
    let littleEndian = true;
    const characterSet = "ISO_IR 192"; // Default: UTF-8

    // Check for DICM preamble (128 bytes) + "DICM" magic string
    if (buffer.byteLength >= 132) {
        const magic = new Uint8Array(buffer, 128, 4);
        const magicString = String.fromCharCode(...magic);
        if (magicString === "DICM") {
            isDicomPart10 = true;
            offset = 132;
        }
    }

    // If not Part 10, check if it starts with a valid DICOM tag
    if (!isDicomPart10) {
        view.setPosition(0);
        try {
            const group = view.peekUint16();
            if (group <= 0xffff && group !== 0x0000) {
                offset = 0;
            } else {
                throw new Error("Invalid DICOM file format");
            }
        } catch (e) {
            throw new Error("Invalid DICOM file format");
        }
    }

    if (isDicomPart10) {
        const metaView = new SafeDataView(buffer, offset);
        metaView.setEndianness(true); // Meta information is always little endian

        try {
            const metaInfo = readMetaInformation(metaView);
            transferSyntax = metaInfo.transferSyntax || transferSyntax;
            offset += metaView.getPosition();

            // Determine endianness and VR type from transfer syntax
            if (transferSyntax === TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN) {
                explicitVR = false;
                littleEndian = true;
            } else if (
                transferSyntax === TRANSFER_SYNTAX_EXPLICIT_VR_BIG_ENDIAN
            ) {
                explicitVR = true;
                littleEndian = false;
            } else {
                explicitVR = true;
                littleEndian = true;
            }
        } catch {
            // If reading fails, use defaults
            explicitVR = true;
            littleEndian = true;
        }
    } else {
        // Not Part 10 file, use defaults
        explicitVR = false; // Assume implicit VR for non-Part 10 files
        littleEndian = true;
    }

    return {
        offset,
        isDicomPart10,
        transferSyntax,
        explicitVR,
        littleEndian,
        characterSet,
    };
}

/**
 * Read meta information from Part 10 file
 */
function readMetaInformation(metaView: SafeDataView): {
    transferSyntax?: string;
    characterSet?: string;
} {
    const result: { transferSyntax?: string; characterSet?: string } = {};

    // Read meta information group length (0002,0000)
    const metaGroup = metaView.readUint16();
    const metaElement = metaView.readUint16();

    if (metaGroup !== 0x0002 || metaElement !== 0x0000) {
        return result;
    }

    // Read VR and length
    const vrBytes = metaView.readBytes(2);
    const vr = String.fromCharCode(vrBytes[0], vrBytes[1]);
    let length: number;
    if (requiresExplicitLength(vr)) {
        metaView.readUint16(); // Skip reserved bytes
        length = metaView.readUint32();
    } else {
        length = metaView.readUint16();
    }
    metaView.readBytes(length); // Skip group length value

    // Scan through meta information elements
    const maxMetaElements = 20;
    let metaIterations = 0;

    while (
        metaView.getRemainingBytes() >= 8 &&
        metaIterations < maxMetaElements
    ) {
        metaIterations++;
        const tsGroup = metaView.readUint16();
        const tsElement = metaView.readUint16();

        if (tsGroup === 0x0002 && tsElement === 0x0010) {
            // Transfer syntax UID
            const tsVrBytes = metaView.readBytes(2);
            const tsVr = String.fromCharCode(tsVrBytes[0], tsVrBytes[1]);
            let tsLength: number;
            if (requiresExplicitLength(tsVr)) {
                metaView.readUint16();
                tsLength = metaView.readUint32();
            } else {
                tsLength = metaView.readUint16();
            }
            result.transferSyntax = metaView
                .readString(tsLength)
                .replace(/\u0000/g, "")
                .trim();
        } else if (tsGroup === 0x0002) {
            // Still in meta information group, skip this element
            const tsVrBytes = metaView.readBytes(2);
            const tsVr = String.fromCharCode(tsVrBytes[0], tsVrBytes[1]);
            let tsLength: number;
            if (requiresExplicitLength(tsVr)) {
                metaView.readUint16();
                tsLength = metaView.readUint32();
            } else {
                tsLength = metaView.readUint16();
            }
            metaView.readBytes(tsLength);
        } else {
            // Left meta information group
            metaView.setPosition(metaView.getPosition() - 4);
            break;
        }
    }

    return result;
}

/**
 * Parse context
 */
interface ParseContext {
    explicitVR: boolean;
    littleEndian: boolean;
    characterSet: string;
    transferSyntax?: string;
    skipPixelData?: boolean;
    filterTags?: Set<string>;
    pixelDataPlugin?: (
        element: DicomElement,
        transferSyntax: string,
    ) => unknown;
}

/**
 * Parse all data elements
 */
function parseDataElements(
    view: SafeDataView,
    context: ParseContext,
): {
    dict: Record<string, DicomElement>;
    detectedCharacterSet?: string;
} {
    const dict: Record<string, DicomElement> = {};
    let detectedCharacterSet: string | undefined;
    const maxIterations = 10000;
    let iterations = 0;

    while (view.getRemainingBytes() >= 8 && iterations < maxIterations) {
        iterations++;

        try {
            const element = parseElement(view, context);
            if (!element) {
                break;
            }

            // If element returned empty dict (skipped due to filter), continue loop
            if (Object.keys(element.dict).length === 0) {
                continue;
            }

            // Check for character set tag (0008,0005) - Specific Character Set
            for (const tag in element.dict) {
                const cleanTag = tag
                    .replace(/^x/i, "")
                    .replace(/,/g, "")
                    .toUpperCase();
                if (cleanTag === "00080005") {
                    const charSetElem = element.dict[tag];
                    const charSetValue =
                        charSetElem?.Value || charSetElem?.value;
                    if (typeof charSetValue === "string") {
                        detectedCharacterSet = charSetValue
                            .split("\\")[0]
                            .trim();
                        context.characterSet = detectedCharacterSet;
                    } else if (
                        Array.isArray(charSetValue) &&
                        charSetValue.length > 0 &&
                        typeof charSetValue[0] === "string"
                    ) {
                        detectedCharacterSet = charSetValue[0].trim();
                        context.characterSet = detectedCharacterSet;
                    }
                }
            }

            // Store in dict
            for (const tag in element.dict) {
                dict[tag] = element.dict[tag];
            }
        } catch {
            break;
        }
    }

    return { dict, detectedCharacterSet };
}

/**
 * Parse a single element
 */
function parseElement(
    view: SafeDataView,
    context: ParseContext,
): {
    dict: Record<string, DicomElement>;
} | null {
    if (view.getRemainingBytes() < 8) {
        return null;
    }

    // Read tag
    const group = view.readUint16();
    const element = view.readUint16();
    const tagHex = formatTag(group, element);

    // Check for sequence delimiter or end of data
    if (group === 0xfffe && (element === 0xe0dd || element === 0xe00d)) {
        view.readUint32(); // Read length (should be 0)
        return null;
    }

    // Read VR
    let vr = "UN";
    let length: number;

    if (context.explicitVR) {
        const vrBytes = view.readBytes(2);
        vr = String.fromCharCode(vrBytes[0], vrBytes[1]);

        if (requiresExplicitLength(vr)) {
            view.readUint16(); // Skip reserved bytes
            length = view.readUint32();
        } else {
            length = view.readUint16();
        }
    } else {
        // Implicit VR: use detection
        length = view.readUint32();

        // Check if private tag and use enhanced detection
        if (isPrivateTag(tagHex)) {
            vr = detectVRForPrivateTag(group, element, length);
        } else {
            vr = detectVR(group, element);
        }
    }

    // Filter Check
    if (context.filterTags && !context.filterTags.has(tagHex)) {
        // Skip this element
        if (length === 0xffffffff) {
            // Skip undefined length (rudimentary skip for speed)
            if (vr === "SQ" || (group === 0x7fe0 && element === 0x0010)) {
                let skipped = 0;
                while (view.getRemainingBytes() >= 8 && skipped < 50000000) {
                    const g = view.readUint16();
                    const e = view.readUint16();
                    if (g === 0xfffe && e === 0xe0dd) {
                        view.readUint32();
                        break;
                    }
                    view.setPosition(view.getPosition() - 4 + 2);
                    skipped += 2;
                }
            }
        } else {
            if (view.getRemainingBytes() >= length) {
                view.setPosition(view.getPosition() + length);
            } else {
                return null; // EOF
            }
        }
        // Return empty dict to signal skip
        return { dict: {} };
    }

    // Handle sequences
    if (vr === "SQ" || length === 0xffffffff) {
        const sequence = parseSequence(
            view,
            context.explicitVR,
            context.littleEndian,
            context.characterSet,
            length === 0xffffffff,
        );

        const elementLength = length === 0xffffffff ? undefined : length;
        const elementData: DicomElement = {
            vr: "SQ",
            VR: "SQ",
            Value: sequence as unknown as
                | Array<string | number>
                | Record<string, unknown>
                | Array<Uint8Array>,
            value: sequence as unknown as
                | Array<string | number>
                | Record<string, unknown>
                | Array<Uint8Array>,
            length: elementLength,
            Length: elementLength,
            items: sequence as unknown[],
            Items: sequence as unknown[],
        };

        return {
            dict: {
                [tagHex]: elementData,
            },
        };
    }

    // Handle pixel data (7FE0,0010)
    const isPixelData = group === 0x7fe0 && element === 0x0010;
    let value:
        | string
        | number
        | Array<string | number>
        | Record<string, unknown>
        | Uint8Array
        | Array<Uint8Array>
        | Float64Array
        | Int32Array
        | undefined = undefined;

    if (isPixelData) {
        if (context.skipPixelData) {
            // ... (skip logic)
            if (length === 0xffffffff) {
                let skipped = 0;
                while (view.getRemainingBytes() >= 8 && skipped < 100000000) {
                    const g = view.readUint16();
                    const e = view.readUint16();
                    if (g === 0xfffe && e === 0xe0dd) {
                        view.readUint32();
                        break;
                    }
                    view.setPosition(view.getPosition() - 4 + 2);
                    skipped += 2;
                }
            } else {
                view.readBytes(length);
            }
            value = undefined;
        } else {
            const pixelDataResult = extractPixelDataFromView(
                view,
                length,
                context.transferSyntax,
            );
            if (pixelDataResult) {
                if (
                    pixelDataResult.isEncapsulated &&
                    pixelDataResult.fragmentArrays &&
                    pixelDataResult.fragmentArrays.length > 0
                ) {
                    value = pixelDataResult.fragmentArrays;
                } else {
                    value = pixelDataResult.pixelData;
                }
            } else {
                // ... (fallback skip)
                if (length === 0xffffffff) {
                    let skipped = 0;
                    while (view.getRemainingBytes() >= 8 && skipped < 1000000) {
                        const g = view.readUint16();
                        const e = view.readUint16();
                        if (g === 0xfffe && e === 0xe0dd) {
                            view.readUint32();
                            break;
                        }
                        view.setPosition(view.getPosition() - 4);
                        view.readBytes(Math.min(8, view.getRemainingBytes()));
                        skipped += 8;
                    }
                } else {
                    view.readBytes(length);
                }
                return null;
            }
        }
    } else if (length > 0 && view.getRemainingBytes() >= length) {
        const maxSize = 10000000;
        if (length > maxSize) {
            view.readBytes(maxSize);
            return null;
        }
        try {
            value = parseElementValue(view, vr, length, context.characterSet);
        } catch {
            view.readBytes(length);
            return null;
        }
    } else if (length === 0) {
        value = undefined;
    } else {
        return null;
    }

    const elementData: DicomElement = {
        vr,
        VR: vr,
        Value: value,
        value: value,
        length,
        Length: length,
    };
    if (elementData.items === undefined) {
        elementData.items = undefined;
        elementData.Items = undefined;
    }

    // Plugin Hook: If this is pixel data and we have a plugin, call it!
    if (isPixelData && context.pixelDataPlugin && !context.skipPixelData) {
        try {
            const decoded = context.pixelDataPlugin(
                elementData,
                context.transferSyntax || "",
            );
            if (decoded !== undefined) {
                elementData.Value = decoded as any;
                elementData.value = decoded as any;
            }
        } catch (e) {
            // Log or ignore? For now ignore and leave original value (compressed)
        }
    }

    return {
        dict: {
            [tagHex]: elementData,
        },
    };
}

/**
 * Unified Parser Options
 */

/**
 * Unified Parser Options
 */
export interface UnifiedParseOptions {
    /**
     * Parsing strategy:
     * - 'fast': Ultra-fast scan (minimal metadata only). Fastest mode.
     * - 'shallow': Structured scan only (offsets/lengths). Very fast.
     * - 'full': Eagerly decodes all values.
     * - 'light': Full parse but skips reading Pixel Data value (saves memory).
     * - 'lazy': Returns object that reads values from buffer on demand.
     *
     * Note: 'custom' is no longer a distinct type. Use `tags` option with any type
     * to restrict parsing/scanning to specific tags.
     */
    type?: "fast" | "shallow" | "full" | "light" | "lazy";

    /**
     * Tags to include in the result.
     * Can be a single tag string or array of tag strings.
     * Formats: 'x00100010', '0010,0010', or '00100010'.
     */
    tags?: string | string[];

    /**
     * Custom plugin to decode pixel data.
     */
    pixelDataPlugin?: (
        element: DicomElement,
        transferSyntax: string,
    ) => unknown;

    // Deprecated options removed (customTags, tag)
}

/**
 * Main Unified Parse Function
 *
 * @param byteArray - The DICOM file data
 * @param options - Configuration options
 */
export function parse(
    byteArray: Uint8Array,
    options: UnifiedParseOptions = {},
): DicomDataSet | ShallowDicomDataSet {
    const mode = options.type || "full";

    // Normalize tags
    let filterTags: string[] | undefined;
    if (options.tags) {
        if (Array.isArray(options.tags)) {
            filterTags = options.tags;
        } else {
            filterTags = [options.tags];
        }
    }

    // Common: if full/light, we pass tags to parseWithMetadata (via fullParse wrapper which needs update)
    // But fullParse currently doesn't accept options. I need to update fullParse/mediumParse signatures?
    // No, I can call parseWithMetadata directly here if I want, or update helpers.
    // Best to call parseWithMetadata/shallowParse directly for maximum control in this unified function.

    switch (mode) {
        case "fast":
            return fastParse(byteArray, filterTags);

        case "full":
        case "light":
            const parseOpts: ParseOptions = {
                skipPixelData: mode === "light",
                filterTags: filterTags, // We need to add this to ParseOptions!
                pixelDataPlugin: options.pixelDataPlugin,
            };
            // We can call parseWithMetadata directly
            const res = parseWithMetadata(byteArray, parseOpts);
            if (res.transferSyntax)
                res.dataset.transferSyntax = res.transferSyntax;
            if (res.characterSet) res.dataset.characterSet = res.characterSet;
            return res.dataset;

        case "shallow":
            return shallowParse(byteArray, filterTags);

        case "lazy":
            return createLazyDataSet(byteArray, filterTags);

        default:
            throw new Error(`Unknown parse type: ${mode}`);
    }
}

function createLazyDataSet(
    byteArray: Uint8Array,
    filterTags?: string[],
): DicomDataSet {
    // 1. Perform shallow parse to get offsets
    const shallow = shallowParse(byteArray, filterTags);

    // Normalize filter tags if present
    const validTags = filterTags
        ? new Set(filterTags.map((t) => normalizeTag(t)))
        : null;

    // 2. Wrap in a Proxy to separate read logic
    let buffer: ArrayBuffer;
    if (byteArray.buffer instanceof ArrayBuffer) {
        buffer = byteArray.buffer;
    } else {
        buffer = new ArrayBuffer(byteArray.byteLength);
        new Uint8Array(buffer).set(byteArray);
    }

    const view = new SafeDataView(buffer);

    // Detect endianness again for reading values
    let detection: FormatDetection;
    try {
        detection = detectDicomFormat(view, buffer);
    } catch {
        // fallback
        detection = {
            offset: 0,
            isDicomPart10: false,
            transferSyntax: TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN,
            explicitVR: false,
            littleEndian: true,
            characterSet: "ISO_IR 192",
        };
    }

    view.setEndianness(detection.littleEndian);

    const context = {
        view,
        characterSet: detection.characterSet,
    };

    // Helper to read a tag value given shallow element
    const readValue = (tag: string) => {
        // If filter is active and tag not allowed, return undefined (mimic absence)
        if (validTags && !validTags.has(tag)) return undefined;

        const meta = shallow[tag];
        if (!meta) return undefined;

        view.setPosition(meta.dataOffset);
        const vr = meta.vr;
        const length = meta.length;

        if (length === 0) return undefined;
        if (length === 0xffffffff) return undefined; // Lazy doesn't support encapsulated/undefined length values well yet

        try {
            return parseElementValue(view, vr, length, context.characterSet);
        } catch (e) {
            return undefined;
        }
    };

    // Create the proxy for 'dict'
    const dictProxy = new Proxy(
        {},
        {
            get: (target, prop) => {
                if (typeof prop === "string") {
                    const val = readValue(prop);
                    if (val !== undefined) {
                        return {
                            vr: shallow[prop]?.vr || "UN",
                            Value: val,
                            value: val,
                            length: shallow[prop]?.length,
                        };
                    }
                }
                return undefined;
            },
            has: (target, prop) => {
                if (typeof prop !== "string") return false;
                if (validTags && !validTags.has(prop)) return false;
                // Check shallow
                const meta = shallow[prop];
                return !!meta;
            },
            ownKeys: (target) => {
                const keys = Object.keys(shallow);
                return validTags ? keys.filter((k) => validTags.has(k)) : keys;
            },
            getOwnPropertyDescriptor: (target, prop) => {
                if (typeof prop === "string" && shallow[prop]) {
                    if (validTags && !validTags.has(prop)) {
                        return undefined;
                    }
                    return { enumerable: true, configurable: true };
                }
                return undefined;
            },
        },
    );

    return {
        dict: dictProxy as Record<string, DicomElement>,
        elements: dictProxy as Record<string, DicomElement>,
        string: (tag) => {
            const v = readValue(tag);
            return typeof v === "string" ? v : undefined;
        },
        uint16: (tag) => {
            const v = readValue(tag);
            return typeof v === "number" ? v : undefined;
        },
        int16: (tag) => {
            const v = readValue(tag);
            return typeof v === "number" ? v : undefined;
        },
        floatString: (tag) => {
            const v = readValue(tag);
            return typeof v === "number" ? v : undefined;
        },
    };
}

/**
 * Ultra-fast parsing mode - optimized for maximum speed
 * Minimal overhead: skips most validations, uses numeric tag comparison
 * Only creates string keys when storing tags
 *
 * @param byteArray - The DICOM file as a Uint8Array
 * @param filterTags - Optional array of tags to include
 * @returns A ShallowDicomDataSet map
 */
function fastParse(
    byteArray: Uint8Array,
    filterTags?: string[],
): ShallowDicomDataSet {
    let buffer: ArrayBuffer;
    let byteOffset = 0;
    if (byteArray.buffer instanceof ArrayBuffer) {
        buffer = byteArray.buffer;
        byteOffset = byteArray.byteOffset;
    } else {
        buffer = new ArrayBuffer(byteArray.byteLength);
        const newView = new Uint8Array(buffer);
        newView.set(byteArray);
    }

    const view = new SafeDataView(buffer, byteOffset, byteArray.byteLength);

    // Minimal format detection - reuse shallowParse's detection
    let detection: FormatDetection;
    try {
        detection = detectDicomFormat(view, buffer);
    } catch {
        detection = {
            offset: 0,
            isDicomPart10: false,
            transferSyntax: TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN,
            explicitVR: false,
            littleEndian: true,
            characterSet: "ISO_IR 192",
        };
    }

    view.setEndianness(detection.littleEndian);
    view.setPosition(detection.offset);

    const result: ShallowDicomDataSet = {};
    const maxIterations = 50000;
    let iterations = 0;
    const explicitVR = detection.explicitVR;

    // Pre-compute filter tag set for numeric comparison (faster)
    let filterSet: Set<number> | null = null;
    if (filterTags) {
        filterSet = new Set();
        for (const tag of filterTags) {
            const normalized = normalizeTag(tag);
            if (normalized.startsWith("x") && normalized.length === 9) {
                const group = parseInt(normalized.substring(1, 5), 16);
                const element = parseInt(normalized.substring(5, 9), 16);
                filterSet.add((group << 16) | element);
            }
        }
    }

    // Hex digit lookup table for fast tag string generation
    const hexDigits = "0123456789abcdef";
    const hexCache: string[] = [];
    for (let i = 0; i < 65536; i++) {
        hexCache[i] = i.toString(16).padStart(4, "0");
    }

    while (view.getRemainingBytes() >= 8 && iterations < maxIterations) {
        iterations++;

        const elementStart = view.getPosition();

        // Read tag
        const group = view.readUint16();
        const element = view.readUint16();
        const tagNum = (group << 16) | element;

        // Fast delimiter check
        if (group === 0xfffe) {
            if (
                element === 0xe0dd ||
                element === 0xe00d ||
                element === 0xe000
            ) {
                view.readUint32();
                continue;
            }
        }

        // Read VR and Length (optimized)
        let length: number;
        let headerLength: number;
        let vr = "UN";

        if (explicitVR && view.getRemainingBytes() >= 2) {
            const vrBytes = view.readBytes(2);
            const vr0 = vrBytes[0];
            const vr1 = vrBytes[1];
            vr = String.fromCharCode(vr0, vr1);

            // Fast check for long VRs using char codes (avoid string comparison)
            if (
                (vr0 === 0x53 && vr1 === 0x51) || // SQ
                (vr0 === 0x4f && vr1 === 0x42) || // OB
                (vr0 === 0x4f && vr1 === 0x57) || // OW
                (vr0 === 0x4f && vr1 === 0x46) || // OF
                (vr0 === 0x4f && vr1 === 0x44) || // OD
                (vr0 === 0x4f && vr1 === 0x4c) || // OL
                (vr0 === 0x55 && vr1 === 0x4e)
            ) {
                // UN
                view.readUint16(); // Reserved
                length = view.readUint32();
                headerLength = 12;
            } else {
                length = view.readUint16();
                headerLength = 8;
            }
        } else {
            length = view.readUint32();
            headerLength = 8;
        }

        // Fast filter check - only include if in filter set or no filter
        const shouldInclude = !filterSet || filterSet.has(tagNum);

        if (!shouldInclude) {
            // Skip element (fast path)
            if (length === 0xffffffff) {
                // Undefined length - attempt to skip safely
                while (view.getRemainingBytes() >= 8) {
                    const loopStart = view.getPosition();
                    const g = view.readUint16();
                    const e = view.readUint16();
                    if (g === 0xfffe && e === 0xe0dd) {
                        view.readUint32();
                        break;
                    }
                    if (g === 0xfffe && e === 0xe000) {
                        // Item start - read length and skip
                        if (view.getRemainingBytes() >= 4) {
                            const itemLength = view.readUint32();
                            const skip = Math.min(
                                itemLength,
                                view.getRemainingBytes(),
                            );
                            view.setPosition(view.getPosition() + skip);
                        }
                    } else {
                        // Unknown block - advance by 2 bytes to avoid infinite loop
                        if (view.getRemainingBytes() >= 2) {
                            view.setPosition(view.getPosition() + 2);
                        } else {
                            break;
                        }
                    }
                    // Ensure progress
                    if (view.getPosition() <= loopStart) {
                        break;
                    }
                }
            } else {
                const newPos = view.getPosition() + length;
                if (newPos <= view.byteLength) {
                    view.setPosition(newPos);
                } else {
                    break;
                }
            }
            continue;
        }

        // Store tag (use cached hex strings for speed)
        const tagKey = `x${hexCache[group]}${hexCache[element]}`;
        result[tagKey] = {
            tag: tagKey,
            vr,
            length,
            dataOffset: elementStart + headerLength,
        };

        // Advance past value
        if (length === 0xffffffff) {
            // Undefined length - fast skip with progress checks
            while (view.getRemainingBytes() >= 8) {
                const loopStart = view.getPosition();
                const g = view.readUint16();
                const e = view.readUint16();
                if (g === 0xfffe && e === 0xe0dd) {
                    view.readUint32();
                    break;
                }
                if (g === 0xfffe && e === 0xe000) {
                    // Item start - skip declared length
                    if (view.getRemainingBytes() >= 4) {
                        const itemLength = view.readUint32();
                        const skip = Math.min(
                            itemLength,
                            view.getRemainingBytes(),
                        );
                        view.setPosition(view.getPosition() + skip);
                    }
                } else {
                    // Unknown - advance minimally to avoid hang
                    if (view.getRemainingBytes() >= 2) {
                        view.setPosition(view.getPosition() + 2);
                    } else {
                        break;
                    }
                }
                if (view.getPosition() <= loopStart) {
                    break;
                }
            }
        } else {
            const newPos = view.getPosition() + length;
            if (newPos <= view.byteLength) {
                view.setPosition(newPos);
            } else {
                break;
            }
        }
    }

    return result;
}

/**
 * Parse DICOM file using shallow parsing (tags only, no values)
 * Optimized for speed. Similar to dicom-parser's default behavior.
 * @deprecated Use `parse(byteArray, { type: 'shallow' })` instead.
 *
 * @param byteArray - The DICOM file as a Uint8Array
 * @param filterTags - Optional array of tags to include
 * @returns A ShallowDicomDataSet map
 */
function shallowParse(
    byteArray: Uint8Array,
    filterTags?: string[],
): ShallowDicomDataSet {
    let buffer: ArrayBuffer;
    let byteOffset = 0;
    if (byteArray.buffer instanceof ArrayBuffer) {
        buffer = byteArray.buffer;
        byteOffset = byteArray.byteOffset;
    } else {
        buffer = new ArrayBuffer(byteArray.byteLength);
        const newView = new Uint8Array(buffer);
        newView.set(byteArray);
    }

    const view = new SafeDataView(buffer, byteOffset, byteArray.byteLength);

    // Detect format
    let detection: FormatDetection;
    try {
        detection = detectDicomFormat(view, buffer);
    } catch {
        // Fallback defaults
        detection = {
            offset: 0,
            isDicomPart10: false,
            transferSyntax: TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN,
            explicitVR: false,
            littleEndian: true,
            characterSet: "ISO_IR 192",
        };
    }

    view.setEndianness(detection.littleEndian);
    view.setPosition(detection.offset);

    const result: ShallowDicomDataSet = {};
    const maxIterations = 100000;
    let iterations = 0;
    const explicitVR = detection.explicitVR;

    // Normalize filter tags for fast lookup
    const allowedTags = filterTags
        ? new Set(filterTags.map((t) => normalizeTag(t)))
        : null;

    while (view.getRemainingBytes() >= 8 && iterations < maxIterations) {
        iterations++;

        // Save start position
        const elementStart = view.getPosition();

        // Read tag
        const group = view.readUint16();
        const element = view.readUint16();

        // Check for delimiters early (before any string ops)
        if (group === 0xfffe) {
            if (
                element === 0xe0dd ||
                element === 0xe00d ||
                element === 0xe000
            ) {
                view.readUint32();
                continue;
            }
        }

        // Read VR and Length
        let vr: string | undefined;
        let length: number;
        let headerLength = 0;

        if (explicitVR) {
            const vrBytes = view.readBytes(2);
            vr = String.fromCharCode(vrBytes[0], vrBytes[1]);

            if (requiresExplicitLength(vr)) {
                view.readUint16();
                length = view.readUint32();
                headerLength = 12;
            } else {
                length = view.readUint16();
                headerLength = 8;
            }
        } else {
            length = view.readUint32();
            headerLength = 8;
            // Defer VR detection until after filter check
        }

        // Format tag ONLY if we need to check filter or store result
        const tagKey = formatTag(group, element);

        // Filter check
        if (allowedTags && !allowedTags.has(tagKey)) {
            // Skip without VR detection
            if (length === 0xffffffff) {
                // Skip undefined length
                if (group === 0x7fe0 && element === 0x0010) {
                    let skipped = 0;
                    while (
                        view.getRemainingBytes() >= 8 &&
                        skipped < 50000000
                    ) {
                        const g = view.readUint16();
                        const e = view.readUint16();
                        if (g === 0xfffe && e === 0xe0dd) {
                            view.readUint32();
                            break;
                        }
                        view.setPosition(view.getPosition() - 4 + 2);
                        skipped += 2;
                    }
                }
            } else {
                if (view.getRemainingBytes() >= length) {
                    view.setPosition(view.getPosition() + length);
                } else {
                    break;
                }
            }
            continue;
        }

        // Detect VR only for implicit VR when we're storing this tag
        if (!explicitVR && !vr) {
            vr = detectVR(group, element) || "UN";
        }

        // Store result
        const dataOffset = elementStart + headerLength;
        result[tagKey] = {
            vr: vr!,
            length,
            dataOffset,
        };

        // Advance past value
        if (length === 0xffffffff) {
            if (group === 0x7fe0 && element === 0x0010) {
                let skipped = 0;
                while (view.getRemainingBytes() >= 8 && skipped < 50000000) {
                    const g = view.readUint16();
                    const e = view.readUint16();
                    if (g === 0xfffe && e === 0xe0dd) {
                        view.readUint32();
                        break;
                    }
                    view.setPosition(view.getPosition() - 4 + 2);
                    skipped += 2;
                }
            }
        } else {
            if (view.getRemainingBytes() >= length) {
                view.setPosition(view.getPosition() + length);
            } else {
                break;
            }
        }
    }

    return result;
}

/**
 * Extract pixel data from DICOM file
 * Scans for Pixel Data element (7FE0,0010) and returns it.
 *
 * @param byteArray - The DICOM file as a Uint8Array
 * @returns PixelDataInfo or null if not found
 */
export function extractPixelData(byteArray: Uint8Array): PixelDataInfo | null {
    // Ensure ArrayBuffer and SafeDataView
    let buffer: ArrayBuffer;
    let byteOffset = 0;
    if (byteArray.buffer instanceof ArrayBuffer) {
        buffer = byteArray.buffer;
        byteOffset = byteArray.byteOffset;
    } else {
        buffer = new ArrayBuffer(byteArray.byteLength);
        const newView = new Uint8Array(buffer);
        newView.set(byteArray);
    }

    const view = new SafeDataView(buffer, byteOffset, byteArray.byteLength);

    // Detect format
    let detection: FormatDetection;
    try {
        detection = detectDicomFormat(view, buffer);
    } catch {
        return null;
    }

    view.setEndianness(detection.littleEndian);
    view.setPosition(detection.offset);

    const expectedTransferSyntax = detection.transferSyntax;
    const explicitVR = detection.explicitVR;
    const maxIterations = 100000;
    let iterations = 0;

    while (view.getRemainingBytes() >= 8 && iterations < maxIterations) {
        iterations++;

        // Read tag
        const group = view.readUint16();
        const element = view.readUint16();

        // Debug log for Pixel Data Tag Search (limit output?)
        // if (group === 0x7fe0) console.log(`[ParserDebug] Found group 7FE0, Element: ${element.toString(16)}`);

        // Check for sequence/item delimiters
        if (group === 0xfffe) {
            if (
                element === 0xe0dd ||
                element === 0xe00d ||
                element === 0xe000
            ) {
                view.readUint32(); // Skip length
                continue;
            }
        }

        if (group === 0x7fe0 && element === 0x0010) {
            // Found Pixel Data!
            // Read VR and Length
            let vr = "OW"; // Default for implicit
            let length: number;

            if (explicitVR) {
                const vrBytes = view.readBytes(2);
                vr = String.fromCharCode(vrBytes[0], vrBytes[1]);
                if (requiresExplicitLength(vr)) {
                    view.readUint16();
                    length = view.readUint32();
                } else {
                    length = view.readUint16();
                }
            } else {
                length = view.readUint32();
            }

            // Extract
            const result = extractPixelDataFromView(
                view,
                length,
                expectedTransferSyntax,
            );
            if (result) {
                return {
                    pixelData: result.pixelData,
                    transferSyntax:
                        result.transferSyntax || expectedTransferSyntax,
                    isEncapsulated: result.isEncapsulated,
                    fragments:
                        result.fragmentArrays ||
                        result.fragments?.map((f) => {
                            // Fallback: slice from concatenated pixelData if fragmentArrays not available
                            return result.pixelData.subarray(
                                f.offset,
                                f.offset + f.length,
                            );
                        }),
                };
            }
            return null;
        } else {
            // Skip other elements
            // Need to read length to skip
            let vr = "UN";
            let length: number;

            if (explicitVR) {
                const vrBytes = view.readBytes(2);
                vr = String.fromCharCode(vrBytes[0], vrBytes[1]);
                if (requiresExplicitLength(vr)) {
                    view.readUint16();
                    length = view.readUint32();
                } else {
                    length = view.readUint16();
                }
            } else {
                length = view.readUint32();
            }

            if (length === 0xffffffff) {
                // Undefined length - skip until delimiter
                // Danger zone again.
                // Simplified skip for now
                if (vr === "SQ") {
                    // Skip sequence
                    // We can't easily skip undefined length sequence without parsing it.
                    // Since this is `extractPixelData`, we accept that we might fail on complex undefined length sequences if we don't recurse.
                    // But `mediumParse` logic handles it by recursively calling parseSequence?
                    // Here we just want to scan fast.
                    // Similar scan as shallowParse/mediumParse skip logic.
                    let skipped = 0;
                    while (
                        view.getRemainingBytes() >= 8 &&
                        skipped < 50000000
                    ) {
                        const g = view.readUint16();
                        const e = view.readUint16();
                        if (g === 0xfffe && e === 0xe0dd) {
                            view.readUint32();
                            break;
                        }
                        view.setPosition(view.getPosition() - 4 + 2);
                        skipped += 2;
                    }
                }
            } else {
                if (view.getRemainingBytes() >= length) {
                    view.setPosition(view.getPosition() + length);
                } else {
                    break;
                }
            }
        }
    }

    return null;
}

/**
 * Parse element value based on VR
 */
function parseElementValue(
    view: SafeDataView,
    vr: string,
    length: number,
    characterSet: string,
):
    | string
    | number
    | Array<string | number>
    | Record<string, unknown>
    | string
    | number
    | Array<string | number>
    | Record<string, unknown>
    | Uint8Array
    | Float64Array
    | Int32Array {
    if (
        vr === "OB" ||
        vr === "OW" ||
        vr === "OF" ||
        vr === "OD" ||
        vr === "OL" ||
        vr === "UN"
    ) {
        // Binary data - return as Uint8Array for efficiency
        const bytes = view.readBytes(length);
        return bytes;
    }

    if (vr === "AT") {
        // Attribute tag
        const count = length / 4;
        const tags: number[] = [];
        for (let i = 0; i < count; i++) {
            const g = view.readUint16();
            const e = view.readUint16();
            tags.push(g, e);
        }
        return tags;
    }

    // Numeric Binary VRs (US, SS, UL, SL, FL, FD, AT handled above)
    if (vr === "US") {
        const count = length / 2;
        if (count <= 1) return view.readUint16();
        const vals = [];
        for (let i = 0; i < count; i++) vals.push(view.readUint16());
        return vals;
    }
    if (vr === "SS") {
        const count = length / 2;
        if (count <= 1) return view.readInt16();
        const vals = [];
        for (let i = 0; i < count; i++) vals.push(view.readInt16());
        return vals;
    }
    if (vr === "UL") {
        const count = length / 4;
        if (count <= 1) return view.readUint32();
        const vals = [];
        for (let i = 0; i < count; i++) vals.push(view.readUint32());
        return vals;
    }
    if (vr === "SL") {
        const count = length / 4;
        if (count <= 1) return view.readInt32();
        const vals = [];
        for (let i = 0; i < count; i++) vals.push(view.readInt32());
        return vals;
    }
    if (vr === "FL") {
        const count = length / 4;
        if (count <= 1) return view.readFloat32();
        const vals = [];
        for (let i = 0; i < count; i++) vals.push(view.readFloat32());
        return vals;
    }
    if (vr === "FD") {
        const count = length / 8;
        if (count <= 1) return view.readFloat64();
        const vals = [];
        for (let i = 0; i < count; i++) vals.push(view.readFloat64());
        return vals;
    }

    // Numeric String VRs (DS, IS) - Optimize with Wasm
    if (vr === "DS") {
        const bytes = view.readBytes(length);
        const wasmResult = parseDSWasm(bytes);
        if (wasmResult) {
            return wasmResult;
        }
        // Fallback: Decode as ASCII/UTF-8 and parse in JS
        const str = new TextDecoder().decode(bytes);
        const parts = str.split("\\").filter((p) => p.trim());
        if (parts.length === 1) {
            const num = parseFloat(parts[0]);
            return isNaN(num) ? str : num;
        }
        return parts.map((p) => {
            const num = parseFloat(p.trim());
            return isNaN(num) ? p.trim() : num;
        });
    }

    if (vr === "IS") {
        const bytes = view.readBytes(length);
        const wasmResult = parseISWasm(bytes);
        if (wasmResult) {
            return wasmResult;
        }
        // Fallback
        const str = new TextDecoder().decode(bytes);
        const parts = str.split("\\").filter((p) => p.trim());
        if (parts.length === 1) {
            const num = parseFloat(parts[0]);
            return isNaN(num) ? str : Math.floor(num);
        }
        return parts.map((p) => {
            const num = parseFloat(p.trim());
            return isNaN(num) ? p.trim() : num;
        });
    }

    // String-based VR
    const str = view.readString(length, characterSet);

    // Return raw string - parsing deferred to accessor methods
    // This eliminates expensive PN/DA/TM/DT/AS parsing and string splitting
    // Accessors (dataset.string, etc.) will parse on-demand if needed
    return str;
}

/**
 * Create dataset with accessor methods
 */

function createDataSet(dict: Record<string, DicomElement>): DicomDataSet {
    const getElement = (tag: string): DicomElement | undefined => {
        // Try direct lookup first (most common case)
        const normalized = normalizeTag(tag);
        if (dict[normalized]) return dict[normalized];

        // Fallback: try other tag format variations for compatibility
        const comma = formatTagWithComma(tag);
        const plain = tag.replace(/^x/i, "").replace(/,/g, "");
        return dict[tag] || dict[comma] || dict[plain];
    };

    const dataset = {
        string: (tag: string) => {
            const elem = getElement(tag);
            if (!elem) return undefined;
            const val = elem.Value ?? elem.value;

            // Handle already-parsed TypedArrays from Wasm
            if (
                (val instanceof Float64Array ||
                    val instanceof Int32Array ||
                    val instanceof Float32Array) &&
                val.length > 0
            ) {
                return String(val[0]);
            }

            // Handle string values (may need lazy parsing)
            if (typeof val === "string") {
                // Check if needs special parsing based on VR
                const vr = elem.vr || elem.VR;
                if (vr === "PN") {
                    // Try Wasm PN parsing first
                    const wasmParsed = parsePNWasm(val);
                    if (
                        wasmParsed &&
                        typeof wasmParsed === "object" &&
                        "Alphanumeric" in wasmParsed
                    ) {
                        // Cache the parsed result to avoid re-parsing
                        elem.Value = wasmParsed;
                        return wasmParsed.Alphanumeric;
                    }
                    // Fallback to JS parsing
                    const parsed = parseValueByVR(vr, val);
                    if (
                        typeof parsed === "object" &&
                        parsed !== null &&
                        "Alphanumeric" in parsed
                    ) {
                        // Cache the parsed result
                        elem.Value = parsed;
                        return (parsed as { Alphanumeric?: string })
                            .Alphanumeric;
                    }
                }
                // Multi-value strings: split and return first value
                if (val.includes("\\")) {
                    return val.split("\\")[0];
                }
                return val;
            }

            // Handle arrays
            if (Array.isArray(val) && val.length > 0) {
                if (typeof val[0] === "string") return val[0];
                if (typeof val[0] === "number") return String(val[0]);
            }

            // Handle already-parsed PN objects
            if (
                typeof val === "object" &&
                val !== null &&
                "Alphanumeric" in val
            ) {
                return (val as { Alphanumeric?: string }).Alphanumeric;
            }

            // Handle numbers
            if (typeof val === "number") return String(val);

            return undefined;
        },
        uint16: (tag: string) => {
            const elem = getElement(tag);
            if (!elem) return undefined;
            const val = elem.Value ?? elem.value;
            if (typeof val === "number") return Math.floor(val) & 0xffff;
            if (
                Array.isArray(val) &&
                val.length > 0 &&
                typeof val[0] === "number"
            ) {
                return Math.floor(val[0]) & 0xffff;
            }
            if (typeof val === "string") {
                const num = parseInt(val, 10);
                return isNaN(num) ? undefined : num & 0xffff;
            }
            if (
                (val instanceof Float64Array ||
                    val instanceof Int32Array ||
                    val instanceof Float32Array) &&
                val.length > 0
            ) {
                return Math.floor(val[0]) & 0xffff;
            }
            return undefined;
        },
        int16: (tag: string) => {
            const elem = getElement(tag);
            if (!elem) return undefined;
            const val = elem.Value ?? elem.value;
            if (typeof val === "number") {
                const num = Math.floor(val);
                return num >= -32768 && num <= 32767 ? num : undefined;
            }
            if (
                Array.isArray(val) &&
                val.length > 0 &&
                typeof val[0] === "number"
            ) {
                const num = Math.floor(val[0]);
                return num >= -32768 && num <= 32767 ? num : undefined;
            }
            if (typeof val === "string") {
                const num = parseInt(val, 10);
                return isNaN(num) || num < -32768 || num > 32767
                    ? undefined
                    : num;
            }
            if (
                (val instanceof Float64Array ||
                    val instanceof Int32Array ||
                    val instanceof Float32Array) &&
                val.length > 0
            ) {
                const num = Math.floor(val[0]);
                return num >= -32768 && num <= 32767 ? num : undefined;
            }
            return undefined;
        },
        floatString: (tag: string) => {
            const elem = getElement(tag);
            if (!elem) return undefined;
            const val = elem.Value ?? elem.value;
            if (typeof val === "number") return val;
            if (
                Array.isArray(val) &&
                val.length > 0 &&
                typeof val[0] === "number"
            ) {
                return val[0];
            }
            if (typeof val === "string") {
                const num = parseFloat(val);
                return isNaN(num) ? undefined : num;
            }
            if (
                (val instanceof Float64Array ||
                    val instanceof Int32Array ||
                    val instanceof Float32Array) &&
                val.length > 0
            ) {
                return val[0];
            }
            return undefined;
        },
        intString: (tag: string) => {
            const elem = getElement(tag);
            if (!elem) return undefined;
            const val = elem.Value ?? elem.value;
            if (typeof val === "number") return Math.floor(val);
            if (
                Array.isArray(val) &&
                val.length > 0 &&
                typeof val[0] === "number"
            ) {
                return Math.floor(val[0]);
            }
            if (typeof val === "string") {
                const num = parseInt(val, 10);
                return isNaN(num) ? undefined : Math.floor(num);
            }
            if (
                (val instanceof Float64Array ||
                    val instanceof Int32Array ||
                    val instanceof Float32Array) &&
                val.length > 0
            ) {
                return Math.floor(val[0]);
            }
            return undefined;
        },
        dict: dict,
        elements: dict,
    };

    // Make 'elements' non-enumerable to prevent duplication in JSON output
    Object.defineProperty(dataset, "elements", {
        value: dict,
        enumerable: false, // Hidden from JSON.stringify
        writable: true,
        configurable: true,
    });

    return dataset;
}

/**
 * A convenience function that parses a DICOM file and automatically
 * decodes the pixel data if a compatible codec is registered.
 * @param byteArray - The DICOM file data.
 * @param options - Unified parse options.
 * @returns A promise that resolves to the DicomDataSet with decoded pixel data.
 */
export async function parseAndDecode(
    byteArray: Uint8Array,
    options: UnifiedParseOptions = {},
): Promise<DicomDataSet> {
    // Ensure we parse with pixel data
    const opts = { ...options, type: "full" as const };
    const dataset = parse(byteArray, opts) as DicomDataSet;

    const pixelDataElement = dataset.elements["x7fe00010"];
    const transferSyntax =
        dataset.transferSyntax || dataset.string("x00020010");

    // Check if pixel data is present and compressed (i.e., fragments)
    if (
        pixelDataElement &&
        Array.isArray(pixelDataElement.Value) &&
        transferSyntax
    ) {
        const decoder = await registry.getDecoder(transferSyntax);

        if (decoder) {
            const fragments = pixelDataElement.Value as Uint8Array[];
            const decodeOptions = {
                transferSyntax,
                samplesPerPixel: dataset.uint16("x00280002") || 1,
                bitsAllocated: dataset.uint16("x00280100") || 8,
            };

            const decodedPixels = await decoder.decode(
                fragments,
                decodeOptions,
            );

            // Replace the pixel data value with the decoded buffer
            pixelDataElement.Value = decodedPixels;
            pixelDataElement.vr = "OW"; // Uncompressed is typically OW
        }
    }

    return dataset;
}
