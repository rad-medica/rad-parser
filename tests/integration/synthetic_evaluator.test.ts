/**
 * Evaluator against dicom-parser on a directory of synthetic DICOM files.
 *
 * Generate the data with radspider (no patient data):
 *   cargo run --release -p radspider-synth -- <dir>/synth
 *   cargo run --release --example synth_ct -- <dir>/ct 128 40
 *   cargo run --release --example synth_documents -- <dir>/objects 128 40
 * then run:
 *   RAD_PARSER_SYNTH_DIR=<dir> npx vitest run tests/integration/synthetic_evaluator.test.ts
 *
 * Skipped when RAD_PARSER_SYNTH_DIR is not set. Per file it compares a fixed
 * list of top-level and nested attributes and the Pixel Data bytes with
 * dicom-parser, checks parse -> write -> reparse round trips, and reports
 * crashes, mismatches and timings.
 */
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import dicomParser from "dicom-parser";
import { describe, expect, it } from "vitest";
import { parse, write } from "../../src/index";
import type { DicomDataSet, DicomElement } from "../../src/core/types";

const DATA_DIR = process.env.RAD_PARSER_SYNTH_DIR;

const TOP_TAGS = (
    "0008,0016 0008,0018 0008,0060 0008,0020 0008,0030 0008,103E 0010,0010 " +
    "0010,0020 0010,0030 0010,1030 0020,000D 0020,000E 0020,0011 0020,0013 " +
    "0020,0052 0028,0002 0028,0004 0028,0006 0028,0008 0028,0010 0028,0011 " +
    "0028,0100 0028,0101 0028,0103 0028,0030 0028,1050 0028,1051 0028,1052 " +
    "0028,1053 0020,0032 0020,0037 0018,0050 0018,1063 0054,1001 0054,1102 " +
    "0042,0012 0002,0010"
).split(" ");

const NESTED: Array<[string, string]> = [
    ["0054,0016", "0018,1074"],
    ["0054,0016", "0018,1072"],
    ["5200,9230", "0020,9113"],
    ["5200,9229", "0028,9110"],
    ["0018,6011", "0018,602C"],
    ["0040,A043", "0008,0104"],
];

/** Sequences dicom-parser needs a VR hint for in Implicit VR files. */
const SQ_HINTS = new Set(
    (
        "x00540016 x00209111 x00189118 x52009229 x52009230 x00289110 " +
        "x00209113 x00209116 x00289145 x00289132 x00186011 x0040a043 " +
        "x0040a730 x54000100"
    ).split(" ")
);

/** VRs of the compared tags (PS3.6), used to read dicom-parser values. */
const VR_OF: Record<string, string> = {
    x00080016: "UI",
    x00080018: "UI",
    x00080060: "CS",
    x00080020: "DA",
    x00080030: "TM",
    x0008103e: "LO",
    x00100010: "PN",
    x00100020: "LO",
    x00100030: "DA",
    x00101030: "DS",
    x0020000d: "UI",
    x0020000e: "UI",
    x00200011: "IS",
    x00200013: "IS",
    x00200052: "UI",
    x00280002: "US",
    x00280004: "CS",
    x00280006: "US",
    x00280008: "IS",
    x00280010: "US",
    x00280011: "US",
    x00280100: "US",
    x00280101: "US",
    x00280103: "US",
    x00280030: "DS",
    x00281050: "DS",
    x00281051: "DS",
    x00281052: "DS",
    x00281053: "DS",
    x00200032: "DS",
    x00200037: "DS",
    x00180050: "DS",
    x00181063: "DS",
    x00541001: "CS",
    x00541102: "CS",
    x00420012: "LO",
    x00020010: "UI",
    x00181074: "DS",
    x00181072: "TM",
    x00209113: "SQ",
    x00289110: "SQ",
    x0018602c: "FD",
    x00080104: "LO",
};

const key = (t: string) => "x" + t.replace(",", "").toLowerCase();

function listFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of fs.readdirSync(dir).sort()) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) out.push(...listFiles(p));
        else if (!/\.(md|json|txt|png|jpg)$/i.test(name)) out.push(p);
    }
    return out;
}

function normScalar(v: unknown): string {
    if (typeof v === "number" || typeof v === "bigint") {
        return Number(v).toPrecision(10);
    }
    const s = String(v).trim();
    if (s !== "" && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) {
        return Number(s).toPrecision(10);
    }
    return s;
}

/** Normalise a value: multi-values joined with "\", numbers to 10 digits. */
function norm(v: unknown): string {
    if (v === undefined || v === null) return "";
    if (v instanceof Uint8Array)
        return `bytes:${Buffer.from(v).toString("hex")}`;
    if (Array.isArray(v)) return v.map(x => norm(x)).join("\\");
    if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        if ("Alphabetic" in o) return norm(o.Alphabetic);
        if ("Alphanumeric" in o) return norm(o.Alphanumeric);
        return JSON.stringify(v);
    }
    if (typeof v === "string") return v.split("\\").map(normScalar).join("\\");
    return normScalar(v);
}

type DpDataSet = {
    elements: Record<string, DpElement>;
    string: (t: string, i?: number) => string | undefined;
    uint16: (t: string, i?: number) => number | undefined;
    int16: (t: string, i?: number) => number | undefined;
    uint32: (t: string, i?: number) => number | undefined;
    int32: (t: string, i?: number) => number | undefined;
    float: (t: string, i?: number) => number | undefined;
    double: (t: string, i?: number) => number | undefined;
    byteArray: Uint8Array;
};
type DpElement = {
    tag: string;
    vr?: string;
    length: number;
    dataOffset: number;
    items?: Array<{ dataSet: DpDataSet }>;
    fragments?: Array<{ position: number; length: number }>;
    encapsulatedPixelData?: boolean;
};

function dpValue(ds: DpDataSet, tag: string): string | undefined {
    const el = ds.elements[tag];
    if (!el) return undefined;
    const vr = VR_OF[tag] ?? el.vr ?? "LO";
    if (el.length === 0) return "";
    const read = (
        fn: (t: string, i: number) => number | undefined,
        size: number
    ) => {
        const out: number[] = [];
        for (let i = 0; i < el.length / size; i++)
            out.push(fn.call(ds, tag, i)!);
        return norm(out);
    };
    switch (vr) {
        case "US":
            return read(ds.uint16, 2);
        case "SS":
            return read(ds.int16, 2);
        case "UL":
            return read(ds.uint32, 4);
        case "SL":
            return read(ds.int32, 4);
        case "FL":
            return read(ds.float, 4);
        case "FD":
            return read(ds.double, 8);
        case "SQ":
            return `items:${el.items?.length ?? 0}`;
        default:
            return norm(ds.string(tag) ?? "");
    }
}

function radValue(
    dict: Record<string, DicomElement>,
    tag: string
): string | undefined {
    const el = dict[tag];
    if (!el) return undefined;
    if ((el.vr ?? el.VR) === "SQ" || Array.isArray(el.items)) {
        return `items:${(el.items as unknown[] | undefined)?.length ?? 0}`;
    }
    return norm(el.Value ?? el.value ?? "");
}

function radItems(
    el: DicomElement | undefined
): Array<Record<string, DicomElement>> {
    const items = (el?.items ?? el?.Value) as
        Array<{ elements: Record<string, DicomElement> }> | undefined;
    return Array.isArray(items) ? items.map(i => i.elements ?? {}) : [];
}

function swapWords(b: Uint8Array): Uint8Array {
    const out = new Uint8Array(b.length);
    for (let i = 0; i + 1 < b.length; i += 2) {
        out[i] = b[i + 1]!;
        out[i + 1] = b[i]!;
    }
    return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}

function radPixels(ds: DicomDataSet): Uint8Array | undefined {
    const el = ds.dict["x7fe00010"];
    if (!el) return undefined;
    const v = el.Value;
    if (v instanceof Uint8Array) return v;
    if (Array.isArray(v) && v.every(x => x instanceof Uint8Array)) {
        const frags = v as Uint8Array[];
        const expected = (el.fragments as unknown[] | undefined)?.length;
        // Older rad-parser versions put the Basic Offset Table at Value[0]
        return concat(
            expected !== undefined && frags.length === expected + 1
                ? frags.slice(1)
                : frags
        );
    }
    return undefined;
}

function dpPixels(ds: DpDataSet, bigEndian: boolean): Uint8Array | undefined {
    const el = ds.elements["x7fe00010"];
    if (!el) return undefined;
    if (el.encapsulatedPixelData && el.fragments) {
        return concat(
            el.fragments.map(f =>
                ds.byteArray.subarray(f.position, f.position + f.length)
            )
        );
    }
    const raw = ds.byteArray.subarray(el.dataOffset, el.dataOffset + el.length);
    return bigEndian && el.vr !== "OB" ? swapWords(raw) : raw;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/** Deep comparison of two rad-parser dicts (round trip). */
function diffDicts(
    a: Record<string, DicomElement>,
    b: Record<string, DicomElement>,
    prefix = ""
): string[] {
    const out: string[] = [];
    for (const tag of Object.keys(a)) {
        if (tag.startsWith("x0002")) continue; // File Meta is regenerated
        const ea = a[tag]!;
        const eb = b[tag];
        if (!eb) {
            out.push(`${prefix}${tag}: missing after round trip`);
            continue;
        }
        if (Array.isArray(ea.items)) {
            const ia = radItems(ea);
            const ib = radItems(eb);
            if (ia.length !== ib.length)
                out.push(
                    `${prefix}${tag}: item count ${ia.length} vs ${ib.length}`
                );
            for (let i = 0; i < Math.min(ia.length, ib.length); i++) {
                out.push(
                    ...diffDicts(ia[i]!, ib[i]!, `${prefix}${tag}[${i}].`)
                );
            }
            continue;
        }
        const va =
            Array.isArray(ea.Value) && ea.Value[0] instanceof Uint8Array
                ? concat(ea.Value as Uint8Array[])
                : ea.Value;
        const vb =
            Array.isArray(eb.Value) && eb.Value[0] instanceof Uint8Array
                ? concat(eb.Value as Uint8Array[])
                : eb.Value;
        if (norm(va) !== norm(vb))
            out.push(
                `${prefix}${tag}: ${norm(va).slice(0, 60)} vs ${norm(vb).slice(0, 60)}`
            );
    }
    return out;
}

describe.skipIf(!DATA_DIR)("Synthetic evaluator vs dicom-parser", () => {
    it("matches dicom-parser and round-trips every generated file", () => {
        const files = listFiles(DATA_DIR!);
        const crashes: string[] = [];
        const mismatches: string[] = [];
        const pixelMismatches: string[] = [];
        const roundTrip: string[] = [];
        let compared = 0;
        let values = 0;
        let radMs = 0;
        let dpMs = 0;
        let radLightMs = 0;

        for (const file of files) {
            const buf = fs.readFileSync(file);
            const bytes = new Uint8Array(
                buf.buffer,
                buf.byteOffset,
                buf.length
            );
            const name = path.relative(DATA_DIR!, file);

            let dp: DpDataSet;
            try {
                const t0 = performance.now();
                dp = dicomParser.parseDicom(bytes, {
                    vrCallback: (tag: string) =>
                        SQ_HINTS.has(tag) ? "SQ" : undefined,
                    inflater: (arr: Uint8Array, pos: number) => {
                        const inflated = zlib.inflateRawSync(arr.subarray(pos));
                        const full = new Uint8Array(pos + inflated.length);
                        full.set(arr.subarray(0, pos));
                        full.set(inflated, pos);
                        return full;
                    },
                }) as unknown as DpDataSet;
                dpMs += performance.now() - t0;
            } catch {
                continue; // not a DICOM file dicom-parser can read: nothing to compare
            }

            let rad: DicomDataSet;
            try {
                const t0 = performance.now();
                rad = parse(bytes, { type: "full" }) as DicomDataSet;
                radMs += performance.now() - t0;
                const t1 = performance.now();
                parse(bytes, { type: "light" });
                radLightMs += performance.now() - t1;
            } catch (e) {
                crashes.push(`${name}: ${(e as Error).message}`);
                continue;
            }
            compared++;

            for (const t of TOP_TAGS) {
                const k = key(t);
                const expected = dpValue(dp, k);
                if (expected === undefined) continue;
                values++;
                const got = radValue(rad.dict, k);
                if (got !== expected)
                    mismatches.push(
                        `${name} ${t}: rad=${String(got).slice(0, 80)} dp=${expected.slice(0, 80)}`
                    );
            }
            for (const [sq, t] of NESTED) {
                const dpSeq = dp.elements[key(sq)];
                if (!dpSeq) continue;
                values++;
                const dpCount = dpSeq.items?.length ?? 0;
                const radItemsList = radItems(rad.dict[key(sq)]);
                if (radItemsList.length !== dpCount) {
                    mismatches.push(
                        `${name} ${sq}: items rad=${radItemsList.length} dp=${dpCount}`
                    );
                    continue;
                }
                const first = dpSeq.items?.[0]?.dataSet;
                if (!first) continue;
                const expected = dpValue(first, key(t));
                if (expected === undefined) continue;
                values++;
                const got = radValue(radItemsList[0]!, key(t));
                if (got !== expected)
                    mismatches.push(
                        `${name} ${sq}>${t}: rad=${String(got).slice(0, 80)} dp=${expected.slice(0, 80)}`
                    );
            }

            const ts = dp.string("x00020010");
            const dpPix = dpPixels(dp, ts === "1.2.840.10008.1.2.2");
            if (dpPix) {
                const rp = radPixels(rad);
                if (!rp || !equalBytes(rp, dpPix)) {
                    pixelMismatches.push(
                        `${name}: rad=${rp?.length} dp=${dpPix.length}`
                    );
                }
            }

            try {
                const written = write(rad, { transferSyntax: ts });
                const again = parse(written, { type: "full" }) as DicomDataSet;
                roundTrip.push(
                    ...diffDicts(rad.dict, again.dict).map(d => `${name} ${d}`)
                );
            } catch (e) {
                roundTrip.push(
                    `${name}: write/reparse threw ${(e as Error).message}`
                );
            }
        }

        const summary = {
            files: files.length,
            compared,
            values,
            crashes: crashes.length,
            mismatches: mismatches.length,
            pixelMismatches: pixelMismatches.length,
            roundTripDifferences: roundTrip.length,
            radFullMs: Math.round(radMs),
            radLightMs: Math.round(radLightMs),
            dicomParserMs: Math.round(dpMs),
        };
        console.log(JSON.stringify(summary, null, 2));
        for (const list of [crashes, mismatches, pixelMismatches, roundTrip]) {
            if (list.length) console.log(list.slice(0, 40).join("\n"));
        }
        expect(compared).toBeGreaterThan(0);
        expect(crashes).toEqual([]);
        expect(mismatches).toEqual([]);
        expect(pixelMismatches).toEqual([]);
        expect(roundTrip).toEqual([]);
    }, 600000);
});
