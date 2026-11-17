/**
 * Encodings from PS3.5 that viewers rely on: Deflated Explicit VR Little
 * Endian (A.5), VR UN (6.2.2), DA/TM/DT kept as stored text (6.2), Pixel
 * Data locations for lazy frame access (A.4) and Explicit VR Big Endian.
 */
import { readFileSync } from "fs";
import * as zlib from "zlib";
import { describe, expect, it } from "vitest";
import {
    inflateDicom,
    parse,
    parseDate,
    parseDateTime,
    parseTime,
    write,
} from "../../src/index";
import type {
    DicomDataSet,
    ShallowDicomDataSet,
    SequenceItem,
} from "../../src/core/types";
import { inflateRaw } from "../../src/utils/inflate";
import { fixture } from "../helpers/fixtures";

const load = (name: string) => new Uint8Array(readFileSync(fixture(name)));
const full = (bytes: Uint8Array, pixelData?: "view" | "copy" | "skip") =>
    parse(bytes, { type: "full", pixelData }) as DicomDataSet;

/** Build an Explicit VR Little Endian Part 10 file from raw element bytes. */
function part10(ts: string, body: Uint8Array): Uint8Array {
    const tsBytes = new TextEncoder().encode(ts.length % 2 ? ts + "\0" : ts);
    const meta = new Uint8Array(8 + tsBytes.length);
    const dv = new DataView(meta.buffer);
    dv.setUint16(0, 0x0002, true);
    dv.setUint16(2, 0x0010, true);
    meta[4] = 0x55; // U
    meta[5] = 0x49; // I
    dv.setUint16(6, tsBytes.length, true);
    meta.set(tsBytes, 8);
    const out = new Uint8Array(132 + meta.length + body.length);
    out.set(new TextEncoder().encode("DICM"), 128);
    out.set(meta, 132);
    out.set(body, 132 + meta.length);
    return out;
}

/** Explicit VR LE element with a 32-bit length (OB/UN/SQ layout). */
function longElement(
    group: number,
    element: number,
    vr: string,
    value: Uint8Array,
    undefinedLength = false
): Uint8Array {
    const out = new Uint8Array(12 + value.length);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, group, true);
    dv.setUint16(2, element, true);
    out[4] = vr.charCodeAt(0);
    out[5] = vr.charCodeAt(1);
    dv.setUint32(8, undefinedLength ? 0xffffffff : value.length, true);
    out.set(value, 12);
    return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}

describe("Deflated Explicit VR Little Endian (PS3.5 A.5)", () => {
    it("inflates the Data Set and returns values and pixels", () => {
        const bytes = load("CT16S_DEFL.dcm");
        const ds = full(bytes);
        expect(ds.transferSyntax).toBe("1.2.840.10008.1.2.1.99");
        expect(ds.string("x00080060")).toBe("CT");
        expect(ds.uint16("x00280010")).toBe(128);
        const pixels = ds.dict["x7fe00010"]!.Value as Uint8Array;
        expect(pixels.length).toBe(128 * 128 * 2);

        // Same bytes as Node's zlib, located by dataOffset in the inflated file
        const inflated = inflateDicom(bytes);
        const offset = ds.dict["x7fe00010"]!.dataOffset!;
        expect(inflated.subarray(offset, offset + pixels.length)).toEqual(
            pixels
        );
    });

    it("matches zlib on random and compressible data", () => {
        for (const size of [0, 1, 1000, 70000]) {
            const data = new Uint8Array(size);
            for (let i = 0; i < size; i++) data[i] = (i * 7919) % 251;
            for (const level of [0, 1, 9]) {
                const c = zlib.deflateRawSync(data, { level });
                expect(inflateRaw(new Uint8Array(c))).toEqual(data);
            }
        }
    });

    it("writes a deflated file that zlib and the parser read back", () => {
        const ds = full(load("CT16S_DEFL.dcm"));
        const out = write(ds, { transferSyntax: "1.2.840.10008.1.2.1.99" });
        const again = full(out);
        expect(again.transferSyntax).toBe("1.2.840.10008.1.2.1.99");
        expect(again.dict["x7fe00010"]!.Value).toEqual(
            ds.dict["x7fe00010"]!.Value
        );
        expect(again.string("x00080018")).toBe(ds.string("x00080018"));
        // Even length (NULL pad if needed) and a standard raw deflate stream
        expect(out.length % 2).toBe(0);
        const groupLength = again.dict["x00020000"]!.Value as number;
        const dataStart = 132 + 12 + groupLength; // (0002,0000) is 12 bytes
        const inflated = zlib.inflateRawSync(out.subarray(dataStart));
        expect(new Uint8Array(inflated)).toEqual(
            inflateDicom(out).subarray(dataStart)
        );
    });
});

describe("VR UN (PS3.5 6.2.2)", () => {
    it("re-reads UN through the dictionary VR", () => {
        const ds = full(load("VR_UN.dcm"));
        expect(ds.dict["x00281052"]!.vr).toBe("DS");
        expect(ds.dict["x00281052"]!.Value).toBe(-1024);
        expect(ds.dict["x00281053"]!.Value).toBe(1);
        expect(ds.dict["x00281050"]!.Value).toBe(-600);
        expect(ds.dict["x00281051"]!.Value).toBe(1500);
        expect(ds.floatString("x00281052")).toBe(-1024);
    });

    it("decodes UN values as Little Endian Implicit VR even in Big Endian", () => {
        // (0028,1052) Rescale Intercept as UN with "-1024 " in a BE file
        const value = new TextEncoder().encode("-1024 ");
        const el = new Uint8Array(12 + value.length);
        const dv = new DataView(el.buffer);
        dv.setUint16(0, 0x0028, false);
        dv.setUint16(2, 0x1052, false);
        el[4] = 0x55; // U
        el[5] = 0x4e; // N
        dv.setUint32(8, value.length, false);
        el.set(value, 12);
        // (0028,0010) Rows as UN: 2 bytes, Little Endian regardless of TS
        const rows = new Uint8Array(14);
        const rdv = new DataView(rows.buffer);
        rdv.setUint16(0, 0x0028, false);
        rdv.setUint16(2, 0x0010, false);
        rows[4] = 0x55;
        rows[5] = 0x4e;
        rdv.setUint32(8, 2, false);
        rows[12] = 0x00;
        rows[13] = 0x02; // 512 in Little Endian
        const ds = full(part10("1.2.840.10008.1.2.2", concat(rows, el)));
        expect(ds.dict["x00281052"]!.Value).toBe(-1024);
        expect(ds.dict["x00280010"]!.vr).toBe("US");
        expect(ds.dict["x00280010"]!.Value).toBe(512);
    });

    it("parses an undefined-length UN sequence as Implicit VR Little Endian", () => {
        // (0008,1140) Referenced Image Sequence stored as UN, undefined length
        const uid = new TextEncoder().encode("1.2.3.4\0");
        const inner = new Uint8Array(8 + uid.length);
        const idv = new DataView(inner.buffer);
        idv.setUint16(0, 0x0008, true);
        idv.setUint16(2, 0x1155, true);
        idv.setUint32(4, uid.length, true);
        inner.set(uid, 8);
        const item = new Uint8Array(8);
        const itv = new DataView(item.buffer);
        itv.setUint16(0, 0xfffe, true);
        itv.setUint16(2, 0xe000, true);
        itv.setUint32(4, inner.length, true);
        const delim = new Uint8Array([0xfe, 0xff, 0xdd, 0xe0, 0, 0, 0, 0]);
        const seq = longElement(
            0x0008,
            0x1140,
            "UN",
            concat(item, inner, delim),
            true
        );
        const ds = full(part10("1.2.840.10008.1.2.1", seq));
        const el = ds.dict["x00081140"]!;
        expect(el.vr).toBe("SQ");
        const items = el.items as SequenceItem[];
        expect(items).toHaveLength(1);
        expect(items[0]!.elements["x00081155"]!.Value).toBe("1.2.3.4");
    });
});

describe("DA / TM / DT are returned as stored (PS3.5 6.2)", () => {
    it("keeps the Radiopharmaceutical Start Time text", () => {
        const ds = full(load("PET_SUV.dcm"));
        const items = ds.dict["x00540016"]!.items as SequenceItem[];
        const info = items[0]!.elements;
        expect(info["x00181072"]!.Value).toBe("090000");
        expect(info["x00181074"]!.Value).toBe(350000000);
        expect(ds.dict["x00080020"]!.Value).toBe("20260115");
        expect(ds.dict["x00080030"]!.Value).toBe("093000");
    });

    it("parse helpers return components and never invent a date", () => {
        expect(parseTime("090000")).toEqual({
            hours: 9,
            minutes: 0,
            seconds: 0,
        });
        expect(parseTime("0930")).toEqual({ hours: 9, minutes: 30 });
        expect(parseTime("235959.123")).toEqual({
            hours: 23,
            minutes: 59,
            seconds: 59,
            fraction: "123",
        });
        expect(parseDate("20260115")).toEqual({
            year: 2026,
            month: 1,
            day: 15,
        });
        expect(parseDate("not a date")).toBe("not a date");
        expect(parseDateTime("20260115093000.5+0100")).toEqual({
            year: 2026,
            month: 1,
            day: 15,
            hours: 9,
            minutes: 30,
            seconds: 0,
            fraction: "5",
            utcOffset: "+0100",
        });
        expect(parseDateTime("2026")).toEqual({ year: 2026 });
    });
});

describe("Pixel Data locations (PS3.5 A.4)", () => {
    it("reports fragment offsets and the Basic Offset Table without copying", () => {
        const bytes = load("CT12_J2KR.dcm");
        const skipped = full(bytes, "skip");
        const el = skipped.dict["x7fe00010"]!;
        expect(el.Value).toBeUndefined();
        expect(el.isEncapsulated).toBe(true);
        expect(el.basicOffsetTable).toEqual([0]);
        expect(el.fragments!.length).toBeGreaterThan(0);

        const viewed = full(bytes);
        const frags = viewed.dict["x7fe00010"]!.Value as Uint8Array[];
        expect(frags).toHaveLength(el.fragments!.length);
        el.fragments!.forEach((f, i) => {
            expect(bytes.subarray(f.offset, f.offset + f.length)).toEqual(
                frags[i]
            );
            // Item Tag (FFFE,E000) and length precede each fragment
            const dv = new DataView(bytes.buffer, bytes.byteOffset);
            expect(dv.getUint16(f.offset - 8, true)).toBe(0xfffe);
            expect(dv.getUint16(f.offset - 6, true)).toBe(0xe000);
            expect(dv.getUint32(f.offset - 4, true)).toBe(f.length);
            // Default "view" mode shares the input buffer (zero copy)
            expect(frags[i]!.buffer).toBe(bytes.buffer);
        });
        // JPEG 2000 codestream starts with SOC (FF4F)
        expect(frags[0]![0]).toBe(0xff);
        expect(frags[0]![1]).toBe(0x4f);

        const copied = full(bytes, "copy").dict["x7fe00010"]!
            .Value as Uint8Array[];
        expect(copied[0]!.buffer).not.toBe(bytes.buffer);
        expect(copied[0]).toEqual(frags[0]);
    });

    it("reports the native Pixel Data offset in every mode", () => {
        const bytes = load("MR16_ELE.dcm");
        const ds = full(bytes);
        const el = ds.dict["x7fe00010"]!;
        const shallow = parse(bytes, {
            type: "shallow",
        }) as ShallowDicomDataSet;
        const light = parse(bytes, { type: "light" }) as DicomDataSet;
        expect(shallow["x7fe00010"]!.dataOffset).toBe(el.dataOffset);
        expect(light.dict["x7fe00010"]!.dataOffset).toBe(el.dataOffset);
        expect(light.dict["x7fe00010"]!.Value).toBeUndefined();
        const v = el.Value as Uint8Array;
        expect(
            bytes.subarray(el.dataOffset!, el.dataOffset! + el.length!)
        ).toEqual(v);
    });

    it("shallow mode lists encapsulated fragments", () => {
        const bytes = load("CT16S_RLE.dcm");
        const shallow = parse(bytes, {
            type: "shallow",
        }) as ShallowDicomDataSet;
        const ds = full(bytes, "skip");
        expect(shallow["x7fe00010"]!.fragments).toEqual(
            ds.dict["x7fe00010"]!.fragments
        );
        expect(shallow["x7fe00010"]!.basicOffsetTable).toEqual(
            ds.dict["x7fe00010"]!.basicOffsetTable
        );
    });
});

describe("Explicit VR Big Endian", () => {
    it("returns OW Pixel Data swapped to Little Endian", () => {
        const be = full(load("MR16_EBE.dcm"));
        const le = full(load("MR16_ELE.dcm"));
        expect(be.transferSyntax).toBe("1.2.840.10008.1.2.2");
        expect(be.dict["x7fe00010"]!.Value).toEqual(
            le.dict["x7fe00010"]!.Value
        );
        expect(be.uint16("x00280010")).toBe(le.uint16("x00280010"));
    });

    it("round-trips through the writer in Big Endian", () => {
        const be = full(load("MR16_EBE.dcm"));
        const out = write(be, { transferSyntax: "1.2.840.10008.1.2.2" });
        const again = full(out);
        expect(again.dict["x7fe00010"]!.Value).toEqual(
            be.dict["x7fe00010"]!.Value
        );
        expect(again.uint16("x00280100")).toBe(16);
    });
});
