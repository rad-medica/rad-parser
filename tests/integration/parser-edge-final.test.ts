import {
    parse,
    canParse,
    parseWithMetadata,
    extractTransferSyntax,
} from "../../src/index";
import { write } from "../../src/core/writer";

// Helper to create valid DICOM Part 10 buffer
function createDicomBuffer(tags: Record<string, any> = {}): Uint8Array {
    const dataset = {
        dict: {
            x00100010: { vr: "PN", Value: ["Test^Patient"] },
            ...tags,
        },
        meta: {
            x00020010: { vr: "UI", Value: ["1.2.840.10008.1.2.1"] }, // Explicit LE
        },
    } as any;
    return write(dataset);
}

describe("Parser Edge Cases", () => {
    describe("canParse", () => {
        it("should return false for empty or very small files", () => {
            expect(canParse(new Uint8Array(0))).toBe(false);
            expect(canParse(new Uint8Array(4))).toBe(false);
            expect(canParse(new Uint8Array(7))).toBe(false);
        });

        it("should return true for valid Part 10 file", () => {
            const buffer = createDicomBuffer();
            expect(canParse(buffer)).toBe(true);
        });

        it("should return true for valid non-Part 10 file (starts with tag)", () => {
            const buffer = new Uint8Array(8);
            const view = new DataView(buffer.buffer);
            view.setUint16(0, 0x0008, true); // Group
            view.setUint16(2, 0x0005, true); // Element
            expect(canParse(buffer)).toBe(true);
        });

        it("should return false for invalid non-Part 10 file", () => {
            const buffer = new Uint8Array(140);
            expect(canParse(buffer)).toBe(false);
        });
    });

    describe("extractTransferSyntax", () => {
        it("should extract syntax from Part 10 file", () => {
            const buffer = createDicomBuffer();
            const syntax = extractTransferSyntax(buffer);
            expect(syntax).toEqual("1.2.840.10008.1.2.1");
        });

        it("should return undefined if file is too small", () => {
            expect(extractTransferSyntax(new Uint8Array(10))).toBeNull();
        });

        it("should return undefined if file is not Part 10", () => {
            const buffer = new Uint8Array(20);
            const view = new DataView(buffer.buffer);
            view.setUint16(0, 0x0008, true);
            expect(extractTransferSyntax(buffer)).toBeNull();
        });
    });

    describe("parseWithMetadata Errors", () => {
        it("should throw if file too small", () => {
            expect(() => parseWithMetadata(new Uint8Array(5))).toThrow(
                "File too small",
            );
        });

        it("should throw if format detection fails (invalid start)", () => {
            const buffer = new Uint8Array(140);
            expect(() => parseWithMetadata(buffer)).toThrow(
                "Format detection failed",
            );
        });
    });

    describe("Implicit VR Parsing", () => {
        it("should parse implicit VR element", () => {
            // Tag: 0010,0010 (PatientName), Length: 12, Value: Test^Patient
            const text = "Test^Patient";
            const len = text.length;
            const buffer = new Uint8Array(4 + 4 + len);
            const view = new DataView(buffer.buffer);

            view.setUint16(0, 0x0010, true);
            view.setUint16(2, 0x0010, true);
            view.setUint32(4, len, true);
            for (let i = 0; i < len; i++) buffer[8 + i] = text.charCodeAt(i);

            const result = parseWithMetadata(buffer);
            expect(result.dataset.dict["x00100010"]).toBeDefined();
            expect(result.transferSyntax).toEqual("1.2.840.10008.1.2.1");

            const val = result.dataset.dict["x00100010"].Value;
            expect(val).toMatchObject({ Alphanumeric: "Test^Patient" });
        });
    });

    describe("Tag Filtering", () => {
        it("should only return filtered tags", () => {
            const buffer = createDicomBuffer({
                x00100020: { vr: "LO", Value: ["PID123"] },
            });

            const result = parse(buffer, { tags: ["00100020"] });
            expect(result.dict["x00100020"]).toBeDefined();
            expect(result.dict["x00100010"]).toBeUndefined();
        });
    });

    describe("Pixel Data Skip", () => {
        it("should skip pixel data value when requested", () => {
            const cleanBuffer = createDicomBuffer({
                x7fe00010: { vr: "OB", Value: new Uint8Array([1, 2, 3, 4]) },
            });

            const dataset = parse(cleanBuffer, { type: "light" });
            const pd = dataset.dict["x7fe00010"];
            expect(pd).toBeDefined();
            expect(pd.Value).toBeUndefined();
        });
    });
});
