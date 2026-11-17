/**
 * DICOM Anonymizer (Basic Application Level Confidentiality Profile)
 *
 * De-identifies a data set according to DICOM PS3.15 Annex E, Table E.1-1,
 * in the top level Data Set and in every Sequence Item (PS3.15 E.1.1).
 * See anonymizationRules.ts for how compound actions are resolved.
 */

import { type AnonymizationAction, getProfileRule } from "./anonymizationRules";
import type { DicomDataSet, DicomElement, SequenceItem } from "./types";

export interface AnonymizationOptions {
    /**
     * Custom replacement values for tags.
     * Key: Tag format 'xGGGGEEEE'.
     * Value: New value (string) or null to remove.
     */
    replacements?: Record<string, string | null>;

    /**
     * Dummy value for D actions on text VRs, and for Patient's Name / Patient
     * ID (Z allows a dummy value). Default: 'ANON'
     */
    patientIdPrefix?: string;

    /**
     * If true, keep private tags. Default: false (remove private tags).
     */
    keepPrivateTags?: boolean;

    /**
     * UID Map to maintain consistency across a set of instances.
     * New UIDs are stored/retrieved here (original -> replacement).
     */
    uidMap?: Record<string, string>;

    /**
     * Per-tag action overriding the default resolution of Table E.1-1
     * (e.g. { x00080080: "Z" } to keep an empty Institution Name).
     */
    actionOverrides?: Record<string, AnonymizationAction>;
}

const DEFAULT_PREFIX = "ANON";

export interface AnonymizationContext {
    prefix: string;
    uidMap: Record<string, string>;
    keepPrivateTags?: boolean;
    customReplacements?: Record<string, string | null>;
    actionOverrides?: Record<string, AnonymizationAction>;
}

function groupOf(tag: string): number | null {
    const clean = tag.replace(/^x/i, "");
    if (!/^[0-9a-fA-F]{8}$/.test(clean)) return null;
    return parseInt(clean.slice(0, 4), 16);
}

/**
 * Generate a UID under the 2.25 root from a random (version 4) UUID, as
 * described in PS3.5 Annex B.2.
 */
export function generateUID(): string {
    const bytes = new Uint8Array(16);
    const c = (
        globalThis as {
            crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
        }
    ).crypto;
    if (c?.getRandomValues) {
        c.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    return `2.25.${n.toString()}`;
}

function replaceUID(original: string, uidMap: Record<string, string>): string {
    const clean = original.replace(/\0/g, "").trim();
    if (!clean) return clean;
    let uid = uidMap[clean];
    if (!uid) {
        uid = generateUID();
        uidMap[clean] = uid;
    }
    return uid;
}

/** Dummy value consistent with the VR (PS3.15 Table E.1-1a, action D). */
function dummyValue(vr: string, prefix: string): DicomElement["Value"] {
    switch (vr) {
        case "DA":
            return "19000101";
        case "TM":
            return "000000";
        case "DT":
            return "19000101000000";
        case "AS":
            return "000Y";
        case "DS":
        case "IS":
        case "US":
        case "SS":
        case "UL":
        case "SL":
        case "FL":
        case "FD":
            return 0;
        case "UI":
            return undefined; // handled as U
        case "OB":
        case "OW":
        case "UN":
            return new Uint8Array(2);
        default:
            return prefix;
    }
}

function setValue(element: DicomElement, value: DicomElement["Value"]): void {
    element.Value = value;
    element.value = value;
    element.length =
        typeof value === "string"
            ? value.length
            : value === undefined
              ? 0
              : element.length;
    element.Length = element.length;
}

/**
 * Anonymize a single element. Mutates `element`; returns false when the
 * element must be removed. Sequence Items are de-identified recursively.
 */
export function anonymizeElement(
    tag: string,
    element: DicomElement,
    context: AnonymizationContext
): boolean {
    const key = tag.toLowerCase();
    const group = groupOf(key);

    // Private Data Elements are removed unless explicitly kept
    if (!context.keepPrivateTags && group !== null && group % 2 !== 0) {
        return false;
    }

    const replacement =
        context.customReplacements?.[tag] ?? context.customReplacements?.[key];
    if (replacement !== undefined) {
        if (replacement === null) return false;
        setValue(element, replacement);
        return true;
    }

    const rule = getProfileRule(key);
    const action =
        context.actionOverrides?.[key] ??
        context.actionOverrides?.[tag] ??
        rule?.action;
    const vr = (element.vr ?? element.VR ?? "").toUpperCase();
    const isSequence = vr === "SQ" || Array.isArray(element.items);

    switch (action) {
        case "X":
            return false;
        case "Z":
            if (isSequence) {
                element.items = element.Items = [];
                setValue(element, []);
            } else if (key === "x00100010" || key === "x00100020") {
                // Z allows a dummy value; keep the configured placeholder
                setValue(element, context.prefix);
            } else {
                setValue(element, "");
            }
            return true;
        case "D":
        case "C":
            if (isSequence) break; // keep the sequence, clean its items below
            if (vr === "UI") {
                setValue(element, mapUIDs(element.Value, context.uidMap));
            } else {
                setValue(element, dummyValue(vr, context.prefix));
            }
            return true;
        case "U":
            if (isSequence) break;
            setValue(element, mapUIDs(element.Value, context.uidMap));
            return true;
        default:
            break;
    }

    if (isSequence) {
        const items = (element.items ?? element.Value) as
            | SequenceItem[]
            | undefined;
        if (Array.isArray(items)) {
            const cleaned = items.map(item => ({
                elements: anonymizeDict(item.elements ?? {}, context),
                normalizedElements: {},
            }));
            for (const item of cleaned) item.normalizedElements = item.elements;
            element.items = element.Items = cleaned;
            element.Value = element.value = cleaned;
        }
    }
    return true;
}

function mapUIDs(
    value: unknown,
    uidMap: Record<string, string>
): DicomElement["Value"] {
    if (Array.isArray(value))
        return value.map(v => replaceUID(String(v), uidMap));
    const text = String(value ?? "");
    return text
        .split("\\")
        .map(v => replaceUID(v, uidMap))
        .join("\\");
}

function anonymizeDict(
    dict: Record<string, DicomElement>,
    context: AnonymizationContext
): Record<string, DicomElement> {
    const out: Record<string, DicomElement> = {};
    for (const tag in dict) {
        const element = dict[tag];
        if (!element) continue;
        const copy: DicomElement = { ...element };
        if (Array.isArray(element.Value) && !Array.isArray(element.items)) {
            copy.Value = copy.value = [
                ...(element.Value as unknown[]),
            ] as DicomElement["Value"];
        }
        if (anonymizeElement(tag, copy, context)) out[tag] = copy;
    }
    return out;
}

/**
 * Anonymize a DICOM dataset.
 * Returns a NEW dataset; the original is not mutated.
 *
 * @param dataset - The original dataset
 * @param options - Anonymization options
 * @returns Anonymized DicomDataSet
 */
export function anonymize(
    dataset: DicomDataSet,
    options: AnonymizationOptions = {}
): DicomDataSet {
    const context: AnonymizationContext = {
        prefix: options.patientIdPrefix || DEFAULT_PREFIX,
        uidMap: options.uidMap || {},
        keepPrivateTags: !!options.keepPrivateTags,
        customReplacements: options.replacements,
        actionOverrides: options.actionOverrides,
    };
    const newDict = anonymizeDict(dataset.dict, context);
    const first = (t: string): unknown => {
        const v = newDict[t]?.Value;
        return Array.isArray(v) ? v[0] : v;
    };
    const num = (t: string): number | undefined => {
        const v = first(t);
        const n =
            typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        return Number.isFinite(n) ? n : undefined;
    };
    return {
        dict: newDict,
        elements: newDict,
        string: t => {
            const v = first(t);
            return v === undefined ? undefined : String(v);
        },
        uint16: t => num(t),
        int16: t => num(t),
        floatString: t => num(t),
        intString: t => {
            const n = num(t);
            return n === undefined ? undefined : Math.trunc(n);
        },
        transferSyntax: dataset.transferSyntax,
        characterSet: dataset.characterSet,
    };
}
