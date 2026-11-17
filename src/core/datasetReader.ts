/**
 * Data Set reader (PS3.5 Section 7).
 *
 * One structural reader shared by every parse mode. It walks Data Elements by
 * their encoding (never by scanning for delimiter byte patterns, PS3.5 7.1.2),
 * handles Explicit/Implicit VR, Little/Big Endian, Sequences of defined and
 * undefined length, VR UN (PS3.5 6.2.2) and encapsulated Pixel Data (PS3.5 A.4).
 *
 * Positions are byte offsets into `ctx.bytes` (the array the caller passed, or
 * the inflated file for Deflated Explicit VR Little Endian).
 */

import type {
    DicomElement,
    PixelDataFragment,
    SequenceItem,
    ShallowDicomElement,
} from "./types";
import { lookupVR } from "../utils/vrDictionary";
import { decodeString } from "../utils/SafeDataView";

/** How Pixel Data values are materialised. */
export type PixelDataMode = "view" | "copy" | "skip";

export interface ReaderContext {
    bytes: Uint8Array;
    dv: DataView;
    littleEndian: boolean;
    explicitVR: boolean;
    characterSet: string;
    pixelData: PixelDataMode;
    /** Pixel Representation (0028,0103) seen so far, resolves "US or SS". */
    pixelRepresentation?: number;
}

const UNDEFINED_LENGTH = 0xffffffff;
const MAX_DEPTH = 64;

/** Explicit VRs with a 16-bit Value Length (PS3.5 7.1.2); all others are 32-bit. */
const SHORT_VRS = new Set([
    "AE",
    "AS",
    "AT",
    "CS",
    "DA",
    "DS",
    "DT",
    "FL",
    "FD",
    "IS",
    "LO",
    "LT",
    "PN",
    "SH",
    "SL",
    "SS",
    "ST",
    "TM",
    "UI",
    "UL",
    "US",
]);

/** VRs whose value is a byte or word stream (returned as Uint8Array). */
const BINARY_VRS = new Set(["OB", "OW", "OF", "OD", "OL", "OV", "UN"]);

/** Word size used to byte-swap binary VRs in Big Endian (PS3.5 7.3). */
const WORD_SIZE: Record<string, number> = { OW: 2, OF: 4, OL: 4, OD: 8, OV: 8 };

/** True when the explicit VR uses the 32-bit Value Length layout. */
export function isLongVR(vr: string): boolean {
    return !SHORT_VRS.has(vr);
}

/** Same as isLongVR on the two VR character codes (hot path, no string). */
function isLongVRCode(c0: number, c1: number): boolean {
    switch (c0) {
        case 0x4f: // O: OB OD OF OL OV OW
            return true;
        case 0x53: // S: SQ SV long; SH SL SS ST short
            return c1 === 0x51 || c1 === 0x56;
        case 0x55: // U: UC UN UR UT UV long; UI UL US short
            return c1 !== 0x49 && c1 !== 0x4c && c1 !== 0x53;
        default:
            return false;
    }
}

const HEX: string[] = new Array(65536);
for (let i = 0; i < 65536; i++) HEX[i] = i.toString(16).padStart(4, "0");

export function tagKey(group: number, element: number): string {
    return `x${HEX[group]}${HEX[element]}`;
}

function isUpper(c: number): boolean {
    return c >= 0x41 && c <= 0x5a;
}

/** Resolve the VR to use when the encoding does not carry one (PS3.5 A.1). */
export function implicitVR(
    group: number,
    element: number,
    length: number,
    ctx: ReaderContext | undefined
): string {
    if (element === 0x0000) return "UL"; // Group Length
    if (group & 1) {
        // Private Creator Data Elements (gggg,0010-00FF) are LO (PS3.5 7.8.1)
        if (element >= 0x0010 && element <= 0x00ff) return "LO";
        return length === UNDEFINED_LENGTH ? "SQ" : "UN";
    }
    const vr = lookupVR(group, element);
    if (!vr) return length === UNDEFINED_LENGTH ? "SQ" : "UN";
    if (vr.length === 2) return vr;
    return resolveMultiVR(vr, ctx);
}

/** Resolve "US|SS", "OB|OW", "US|SS|OW" etc. for implicitly encoded values. */
function resolveMultiVR(vr: string, ctx: ReaderContext | undefined): string {
    if (vr.includes("US") || vr.includes("SS")) {
        return ctx?.pixelRepresentation === 1 && vr.includes("SS")
            ? "SS"
            : "US";
    }
    if (vr.includes("OW")) return "OW"; // Implicit VR: OB or OW is OW (PS3.5 A.1)
    return vr.slice(0, 2);
}

interface ElementHeader {
    group: number;
    element: number;
    vr: string;
    length: number;
    valuePos: number;
    /** True when the VR came from the stream (explicit VR). */
    explicit: boolean;
}

/** Read a Data Element header at `pos`; null when it does not fit in `end`. */
function readHeader(
    ctx: ReaderContext,
    pos: number,
    end: number
): ElementHeader | null {
    if (pos + 8 > end) return null;
    const { dv, bytes } = ctx;
    const le = ctx.littleEndian;
    const group = dv.getUint16(pos, le);
    const element = dv.getUint16(pos + 2, le);
    if (group === 0xfffe) {
        return {
            group,
            element,
            vr: "",
            length: dv.getUint32(pos + 4, le),
            valuePos: pos + 8,
            explicit: false,
        };
    }
    if (ctx.explicitVR) {
        const c0 = bytes[pos + 4]!;
        const c1 = bytes[pos + 5]!;
        if (isUpper(c0) && isUpper(c1)) {
            const vr = String.fromCharCode(c0, c1);
            if (isLongVRCode(c0, c1)) {
                if (pos + 12 > end) return null;
                return {
                    group,
                    element,
                    vr,
                    length: dv.getUint32(pos + 8, le),
                    valuePos: pos + 12,
                    explicit: true,
                };
            }
            return {
                group,
                element,
                vr,
                length: dv.getUint16(pos + 6, le),
                valuePos: pos + 8,
                explicit: true,
            };
        }
        // Not a VR: the element is implicitly encoded despite the Transfer
        // Syntax (seen in the wild). Read it as Implicit VR.
    }
    const length = dv.getUint32(pos + 4, le);
    return {
        group,
        element,
        vr: implicitVR(group, element, length, ctx),
        length,
        valuePos: pos + 8,
        explicit: false,
    };
}

/** Options for one Data Set walk. */
export interface ReadOptions {
    /** Only keep these tags (top level only); others are skipped. */
    filter?: Set<string>;
    /** Stop at the first element whose group differs from this one. */
    onlyGroup?: number;
    /** Return element locations only, no values (shallow parse). */
    shallow?: boolean;
    /** Add elements to this dict instead of a new one. */
    into?: Record<string, DicomElement>;
}

export interface ReadResult {
    dict: Record<string, DicomElement>;
    /** Position after the last consumed byte. */
    pos: number;
    /** True when an Item Delimitation Item ended the walk. */
    endedByDelimiter: boolean;
}

/**
 * Read Data Elements from `start` until `end`, an Item Delimitation Item, or
 * a structural error (truncated data stops the walk; it never throws).
 */
export function readDataSet(
    ctx: ReaderContext,
    start: number,
    end: number,
    depth = 0,
    opts: ReadOptions = {}
): ReadResult {
    const dict: Record<string, DicomElement> = opts.into ?? {};
    let pos = start;
    const savedCharset = ctx.characterSet;
    while (pos < end) {
        const h = readHeader(ctx, pos, end);
        if (!h) break;
        if (h.group === 0xfffe) {
            if (h.element === 0xe00d) {
                // Item Delimitation Item ends an undefined-length item
                if (depth > 0) ctx.characterSet = savedCharset;
                return { dict, pos: pos + 8, endedByDelimiter: true };
            }
            if (h.element === 0xe0dd) {
                // Stray Sequence Delimitation Item: tolerate and continue
                pos += 8;
                continue;
            }
            break; // An Item where an element is expected: malformed
        }
        if (opts.onlyGroup !== undefined && h.group !== opts.onlyGroup) break;

        const key = tagKey(h.group, h.element);
        const skip =
            depth === 0 && opts.filter !== undefined && !opts.filter.has(key);
        const res = readElement(ctx, h, end, depth, skip || !!opts.shallow);
        if (!res) break;
        pos = res.next;
        if (!skip && res.element) dict[key] = res.element;

        // Attributes that change how later values are decoded
        if (h.group === 0x0008 && h.element === 0x0005 && res.element) {
            const v = readStringValue(ctx, h.valuePos, valueLength(h, res));
            const first = v.split("\\")[0]!.trim();
            ctx.characterSet = first || "ISO_IR 6";
        } else if (h.group === 0x0028 && h.element === 0x0103 && depth === 0) {
            const v = res.element?.Value;
            if (typeof v === "number") ctx.pixelRepresentation = v;
        }
    }
    if (depth > 0) ctx.characterSet = savedCharset;
    return { dict, pos, endedByDelimiter: false };
}

function valueLength(h: ElementHeader, res: ElementReadResult): number {
    return h.length === UNDEFINED_LENGTH ? res.next - h.valuePos : h.length;
}

interface ElementReadResult {
    element?: DicomElement;
    next: number;
}

function makeElement(
    vr: string,
    value: DicomElement["Value"],
    length: number | undefined,
    dataOffset: number
): DicomElement {
    return {
        vr,
        VR: vr,
        Value: value,
        value,
        length,
        Length: length,
        dataOffset,
    };
}

/** Read one element whose header is `h`. Returns null on truncation. */
function readElement(
    ctx: ReaderContext,
    h: ElementHeader,
    end: number,
    depth: number,
    locationOnly: boolean
): ElementReadResult | null {
    const { group, element, length, valuePos } = h;
    const vr = h.vr;
    const isPixelData =
        group === 0x7fe0 &&
        (element === 0x0010 || element === 0x0008 || element === 0x0009);

    if (length === UNDEFINED_LENGTH) {
        if (isPixelData || (h.explicit && (vr === "OB" || vr === "OW"))) {
            const enc = readEncapsulated(ctx, valuePos, end);
            if (!enc) return null;
            const el = makeElement(
                h.explicit ? vr : "OB",
                undefined,
                UNDEFINED_LENGTH,
                valuePos
            );
            el.isEncapsulated = true;
            el.basicOffsetTable = enc.basicOffsetTable;
            el.fragments = enc.fragments;
            if (!locationOnly && ctx.pixelData !== "skip") {
                el.Value = el.value = enc.fragments.map(f =>
                    ctx.pixelData === "copy"
                        ? ctx.bytes.slice(f.offset, f.offset + f.length)
                        : ctx.bytes.subarray(f.offset, f.offset + f.length)
                );
            }
            return { element: el, next: enc.next };
        }
        // Sequence (SQ, or UN / unknown with undefined length). The content of
        // an undefined-length UN is Implicit VR Little Endian (PS3.5 6.2.2).
        const asImplicit = vr === "UN";
        const seq = readSequence(
            ctx,
            valuePos,
            end,
            true,
            depth,
            asImplicit,
            locationOnly
        );
        const el = makeElement("SQ", seq.items, undefined, valuePos);
        el.items = el.Items = seq.items;
        return { element: el, next: seq.next };
    }

    const valueEnd = valuePos + length;
    if (valueEnd > end) return null; // truncated

    if (locationOnly && depth === 0 && !(vr === "UN" && !(group & 1))) {
        // Shallow: the location is all that is needed; defined-length
        // sequences are skipped without reading their items
        return {
            element: { vr, length, dataOffset: valuePos } as DicomElement,
            next: valueEnd,
        };
    }

    if (vr === "UN" && !(group & 1)) {
        // PS3.5 6.2.2: a UN value whose VR is known is Implicit VR Little
        // Endian, irrespective of the Transfer Syntax.
        const known = implicitVR(group, element, length, ctx);
        if (known !== "UN") {
            if (known === "SQ") {
                const seq = readSequence(
                    ctx,
                    valuePos,
                    valueEnd,
                    false,
                    depth,
                    true,
                    locationOnly
                );
                const el = makeElement("SQ", seq.items, length, valuePos);
                el.items = el.Items = seq.items;
                return { element: el, next: valueEnd };
            }
            const el = makeElement(known, undefined, length, valuePos);
            if (!locationOnly) {
                el.Value = el.value = decodeValue(
                    ctx,
                    known,
                    valuePos,
                    length,
                    true
                );
            }
            return { element: el, next: valueEnd };
        }
    }

    if (vr === "SQ") {
        const seq = readSequence(
            ctx,
            valuePos,
            valueEnd,
            false,
            depth,
            false,
            locationOnly
        );
        const el = makeElement("SQ", seq.items, length, valuePos);
        el.items = el.Items = seq.items;
        return { element: el, next: valueEnd };
    }

    const el = makeElement(vr, undefined, length, valuePos);
    if (isPixelData) {
        if (!locationOnly && ctx.pixelData !== "skip" && length > 0) {
            el.Value = el.value = binaryValue(
                ctx,
                vr,
                valuePos,
                length,
                ctx.littleEndian,
                ctx.pixelData === "copy"
            );
        }
        return { element: el, next: valueEnd };
    }
    if (!locationOnly && length > 0) {
        el.Value = el.value = decodeValue(
            ctx,
            vr,
            valuePos,
            length,
            ctx.littleEndian
        );
    }
    return { element: el, next: valueEnd };
}

interface EncapsulatedResult {
    basicOffsetTable: number[];
    fragments: PixelDataFragment[];
    next: number;
}

/**
 * Walk encapsulated Pixel Data items (PS3.5 A.4): the first item is the Basic
 * Offset Table, the rest are fragments. Nothing is copied here.
 */
function readEncapsulated(
    ctx: ReaderContext,
    start: number,
    end: number
): EncapsulatedResult | null {
    const { dv } = ctx;
    const le = ctx.littleEndian;
    const fragments: PixelDataFragment[] = [];
    let basicOffsetTable: number[] = [];
    let first = true;
    let pos = start;
    while (pos + 8 <= end) {
        const g = dv.getUint16(pos, le);
        const e = dv.getUint16(pos + 2, le);
        const len = dv.getUint32(pos + 4, le);
        if (g === 0xfffe && e === 0xe0dd) {
            return { basicOffsetTable, fragments, next: pos + 8 };
        }
        if (g !== 0xfffe || e !== 0xe000 || len === UNDEFINED_LENGTH) break;
        const dataPos = pos + 8;
        if (dataPos + len > end) break;
        if (first) {
            first = false;
            const n = Math.floor(len / 4);
            basicOffsetTable = new Array<number>(n);
            for (let i = 0; i < n; i++) {
                basicOffsetTable[i] = dv.getUint32(dataPos + i * 4, le);
            }
        } else {
            fragments.push({ offset: dataPos, length: len });
        }
        pos = dataPos + len;
    }
    // Missing Sequence Delimitation Item (truncated): keep what was read
    if (first) return null;
    return { basicOffsetTable, fragments, next: pos };
}

export interface SequenceResult {
    items: SequenceItem[];
    /** Where the caller continues: after the delimiter, or the value end. */
    next: number;
    /** Position after the last item read. */
    itemsEnd: number;
}

/** Read Sequence Items in [start, end); undefined length ends at (FFFE,E0DD). */
export function readSequence(
    ctx: ReaderContext,
    start: number,
    end: number,
    undefinedLength: boolean,
    depth: number,
    implicitLE: boolean,
    locationOnly: boolean
): SequenceResult {
    const items: SequenceItem[] = [];
    // Nested context when the content encoding differs (UN -> Implicit VR LE)
    const sub: ReaderContext =
        implicitLE && (ctx.explicitVR || !ctx.littleEndian)
            ? { ...ctx, explicitVR: false, littleEndian: true }
            : ctx;
    const { dv } = sub;
    const le = sub.littleEndian;
    let pos = start;
    while (pos + 8 <= end) {
        const g = dv.getUint16(pos, le);
        const e = dv.getUint16(pos + 2, le);
        const len = dv.getUint32(pos + 4, le);
        if (g === 0xfffe && e === 0xe0dd) {
            return { items, next: pos + 8, itemsEnd: pos };
        }
        if (g !== 0xfffe || e !== 0xe000) break; // not an item
        const itemStart = pos + 8;
        if (depth + 1 > MAX_DEPTH) break;
        if (len === UNDEFINED_LENGTH) {
            const r = readDataSet(sub, itemStart, end, depth + 1, {
                shallow: locationOnly,
            });
            items.push({ elements: r.dict, normalizedElements: r.dict });
            if (!r.endedByDelimiter) {
                return { items, next: r.pos, itemsEnd: r.pos };
            }
            pos = r.pos;
        } else {
            const itemEnd = Math.min(itemStart + len, end);
            const r = readDataSet(sub, itemStart, itemEnd, depth + 1, {
                shallow: locationOnly,
            });
            items.push({ elements: r.dict, normalizedElements: r.dict });
            pos = itemEnd;
        }
    }
    return { items, next: undefinedLength ? pos : end, itemsEnd: pos };
}

/** Trim trailing spaces and NULs (insignificant padding, PS3.5 6.2). */
function readStringValue(
    ctx: ReaderContext,
    pos: number,
    length: number
): string {
    const { bytes } = ctx;
    let end = pos + length;
    while (end > pos && (bytes[end - 1] === 0x20 || bytes[end - 1] === 0x00))
        end--;
    return decodeText(bytes, pos, end, ctx.characterSet);
}

function decodeText(
    bytes: Uint8Array,
    start: number,
    end: number,
    charset: string
): string {
    // Fast path: 7-bit ASCII is identical in every DICOM default repertoire
    if (end - start <= 24) {
        let out = "";
        for (let i = start; i < end; i++) {
            const c = bytes[i]!;
            if (c >= 0x80 || c === 0x1b) {
                return decodeString(bytes.subarray(start, end), charset);
            }
            out += String.fromCharCode(c);
        }
        return out;
    }
    if (end - start < 1024) {
        let ascii = true;
        for (let i = start; i < end; i++) {
            if (bytes[i]! >= 0x80 || bytes[i] === 0x1b) {
                ascii = false;
                break;
            }
        }
        if (ascii) {
            return String.fromCharCode.apply(
                null,
                bytes.subarray(start, end) as unknown as number[]
            );
        }
    }
    return decodeString(bytes.subarray(start, end), charset);
}

function parseNumberList(
    text: string,
    integer: boolean
): number | Array<string | number> | string {
    const parts = text.split("\\");
    const out: Array<string | number> = new Array(parts.length);
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!.trim();
        if (p === "") {
            out[i] = "";
            continue;
        }
        const n = Number(p);
        out[i] = Number.isNaN(n) ? p : integer ? Math.trunc(n) : n;
    }
    if (out.length === 1) return out[0]!;
    return out;
}

/** Copy (and for Big Endian, byte-swap to Little Endian) a binary value. */
function binaryValue(
    ctx: ReaderContext,
    vr: string,
    pos: number,
    length: number,
    littleEndian: boolean,
    copy: boolean
): Uint8Array {
    const src = ctx.bytes.subarray(pos, pos + length);
    const word = littleEndian ? 1 : (WORD_SIZE[vr] ?? 1);
    if (word === 1) return copy ? src.slice() : src;
    const out = new Uint8Array(length);
    const n = length - (length % word);
    for (let i = 0; i < n; i += word) {
        for (let b = 0; b < word; b++) out[i + b] = src[i + word - 1 - b]!;
    }
    return out;
}

/** Decode a value field according to its VR. */
export function decodeValue(
    ctx: ReaderContext,
    vr: string,
    pos: number,
    length: number,
    littleEndian: boolean
): DicomElement["Value"] {
    if (BINARY_VRS.has(vr))
        return binaryValue(ctx, vr, pos, length, littleEndian, false);
    const { dv } = ctx;
    switch (vr) {
        case "US":
        case "SS":
        case "UL":
        case "SL":
        case "FL":
        case "FD":
        case "SV":
        case "UV": {
            const size =
                vr === "US" || vr === "SS"
                    ? 2
                    : vr === "FD" || vr === "SV" || vr === "UV"
                      ? 8
                      : 4;
            const count = Math.floor(length / size);
            if (count === 0) return undefined;
            const out: Array<number | bigint> = new Array(count);
            for (let i = 0; i < count; i++) {
                const p = pos + i * size;
                switch (vr) {
                    case "US":
                        out[i] = dv.getUint16(p, littleEndian);
                        break;
                    case "SS":
                        out[i] = dv.getInt16(p, littleEndian);
                        break;
                    case "UL":
                        out[i] = dv.getUint32(p, littleEndian);
                        break;
                    case "SL":
                        out[i] = dv.getInt32(p, littleEndian);
                        break;
                    case "FL":
                        out[i] = dv.getFloat32(p, littleEndian);
                        break;
                    case "FD":
                        out[i] = dv.getFloat64(p, littleEndian);
                        break;
                    case "SV":
                        out[i] = dv.getBigInt64(p, littleEndian);
                        break;
                    default:
                        out[i] = dv.getBigUint64(p, littleEndian);
                        break;
                }
            }
            return (count === 1 ? out[0] : out) as DicomElement["Value"];
        }
        case "AT": {
            const count = Math.floor(length / 4);
            const out: number[] = [];
            for (let i = 0; i < count; i++) {
                out.push(
                    dv.getUint16(pos + i * 4, littleEndian),
                    dv.getUint16(pos + i * 4 + 2, littleEndian)
                );
            }
            return out;
        }
        case "DS":
            return parseNumberList(readStringValue(ctx, pos, length), false);
        case "IS":
            return parseNumberList(readStringValue(ctx, pos, length), true);
        default: {
            // Every other VR is character data; DA/TM/DT stay as stored text
            return readStringValue(ctx, pos, length);
        }
    }
}

/** Convert an element read in shallow mode to the public shallow shape. */
export function toShallow(el: DicomElement): ShallowDicomElement {
    const out: ShallowDicomElement = {
        vr: el.vr ?? "UN",
        length: el.length ?? UNDEFINED_LENGTH,
        dataOffset: el.dataOffset ?? 0,
    };
    if (el.fragments) {
        out.fragments = el.fragments;
        out.basicOffsetTable = el.basicOffsetTable;
    }
    return out;
}
