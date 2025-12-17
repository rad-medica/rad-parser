import { describe, expect, it } from "vitest";
import {
    canParse,
    extractTransferSyntax,
    parseWithMetadata,
    parse,
} from "../../src/index";

const encoder = new TextEncoder();

function createExplicitPart10Dicom(patientName: string): Uint8Array {
    const tsUID = "1.2.840.10008.1.2.1";

    const tsBytes = encoder.encode(tsUID);
    const tsLength = tsBytes.length + (tsBytes.length % 2 === 1 ? 1 : 0);
    const tsValue = new Uint8Array(tsLength);
    tsValue.set(tsBytes);

    const pnBytes = encoder.encode(patientName);
    const pnLength = pnBytes.length + (pnBytes.length % 2 === 1 ? 1 : 0);
    const pnValue = new Uint8Array(pnLength);
    pnValue.set(pnBytes);

    const transferSyntaxElement = createExplicitElement(
        0x0002,
        0x0010,
        "UI",
        tsValue
    );
    const metaLength = transferSyntaxElement.length;
    const metaGroupLength = createULValue(metaLength);
    const metaHeader = createExplicitElement(
        0x0002,
        0x0000,
        "UL",
        metaGroupLength
    );

    const patientNameElement = createExplicitElement(
        0x0010,
        0x0010,
        "PN",
        pnValue
    );

    const preamble = new Uint8Array(128);
    const header = new Uint8Array(132);
    header.set(preamble, 0);
    header.set(encoder.encode("DICM"), 128);

    return concatArrays(
        header,
        metaHeader,
        transferSyntaxElement,
        patientNameElement
    );
}

function createImplicitDicom(patientName: string): Uint8Array {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(patientName);
    const length = nameBytes.length;

    const buffer = new Uint8Array(8 + length);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, 0x0010, true);
    view.setUint16(2, 0x0010, true);
    view.setUint32(4, length, true);
    buffer.set(nameBytes, 8);
    return buffer;
}

function createExplicitElement(
    group: number,
    element: number,
    vr: string,
    value: Uint8Array
): Uint8Array {
    const longVRs = new Set([
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
    const headerLength = longVRs.has(vr) ? 12 : 8;
    const buffer = new Uint8Array(headerLength + value.length);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, group, true);
    view.setUint16(2, element, true);
    buffer[4] = vr.charCodeAt(0);
    buffer[5] = vr.charCodeAt(1);

    let offset = 6;
    if (longVRs.has(vr)) {
        view.setUint16(6, 0, true); // reserved
        view.setUint32(8, value.length, true);
        offset = 12;
    } else {
        view.setUint16(6, value.length, true);
        offset = 8;
    }

    buffer.set(value, offset);
    return buffer;
}

function createULValue(length: number): Uint8Array {
    const buffer = new Uint8Array(4);
    new DataView(buffer.buffer).setUint32(0, length, true);
    return buffer;
}

function concatArrays(...arrays: Uint8Array[]): Uint8Array {
    const length = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

describe("integration", () => {
    it("parses a minimal Part 10 file", () => {
        const bytes = createExplicitPart10Dicom("DOE^INFANT");
        expect(canParse(bytes)).toBe(true);
        expect(extractTransferSyntax(bytes)).toBe("1.2.840.10008.1.2.1");

        const { dataset, transferSyntax } = parseWithMetadata(bytes);
        expect(transferSyntax).toBe("1.2.840.10008.1.2.1");
        expect(dataset.string("x00100010")).toBe("DOE^INFANT");
    });

    it("parses an implicit VR little-endian dataset", () => {
        const bytes = createImplicitDicom("DOE^PATIENT");
        const dataset = parse(bytes);
        expect(dataset.string("x00100010")).toBe("DOE^PATIENT");
    });
});
