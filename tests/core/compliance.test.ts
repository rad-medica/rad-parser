import { describe, expect, it } from "vitest";
import { parse } from "../../src/core/parser";
import { DicomDataSet } from "../../src/core/types";
import { write } from "../../src/core/writer";
import { SafeDataView } from "../../src/utils/SafeDataView";

describe("DICOM Compliance Tests", () => {
    describe("Writer Transfer Syntaxes", () => {
        const dataset = {
            dict: {
                x00100010: { vr: "PN", Value: "Doe^John" }, // Patient Name
                x0020000d: { vr: "UI", Value: "1.2.3.4" }, // Study Instance UID
                x00080060: { vr: "CS", Value: "MR" }, // Modality
                x00280010: { vr: "US", Value: 512 }, // Rows
            },
        } as unknown as DicomDataSet;

        it("should write and parse Explicit VR Little Endian (Default)", () => {
            const buffer = write(dataset, {
                transferSyntax: "1.2.840.10008.1.2.1",
            });
            const parsed = parse(buffer);

            expect(parsed.dict["x00100010"].Value).toBe("Doe^John");
            expect(parsed.dict["x00280010"].Value).toBe(512); // Numeric check

            // Check Preamble
            expect(buffer.length).toBeGreaterThan(128 + 4);
            const view = new DataView(buffer.buffer);
            const packetHeader = buffer.slice(128, 132);
            expect(new TextDecoder().decode(packetHeader)).toBe("DICM");
        });

        it("should write and parse Implicit VR Little Endian", () => {
            const buffer = write(dataset, {
                transferSyntax: "1.2.840.10008.1.2",
            });
            const parsed = parse(buffer);

            // Note: Parser might auto-detect Implicit VR based on first tag
            expect(parsed.dict["x00100010"].Value).toBe("Doe^John");
            expect(parsed.dict["x00280010"].Value).toBe(512);

            // Verify it is Implicit:
            // Find Tag after meta header (group 0008 or later)
            // Skip Meta (Group 0002) and Group Length (0002,0000)
            // We can check byte stream manually for VR codes
            // In Implicit, VR is NOT present.
            // Tag (4) + Len (4) + Value.
            // In Explicit, Tag (4) + VR (2) + Len (2).

            // Let's find tag 0028,0010 (Rows)
            // x00280010 -> Group 0028, Element 0010
            // Little Endian Tag: 28 00 10 00 -> 0x0028, 0x0010 -> LE: 28 00 10 00.
            // Wait: SetUint16(0, group, true) -> 0x0028 -> 28 00. (Hex 28=40dec. )
            // 28 hex is 40. 0028 hex is 40 dec.
            // LE Bytes: 28 00.
            // Element 10 00.
            // Tag bytes: 28 00 10 00.

            // Search for these bytes
            let found = false;
            for (let i = 132; i < buffer.length - 8; i++) {
                if (
                    buffer[i] === 0x28 &&
                    buffer[i + 1] === 0x00 &&
                    buffer[i + 2] === 0x10 &&
                    buffer[i + 3] === 0x00
                ) {
                    // Found tag. Next 4 bytes are Length (Implicit) OR VR+Len (Explicit)
                    const nextByte = buffer[i + 4];
                    // "US" in ASCII is 0x55 0x53.
                    // Implicit Length should be 2 (0x02 0x00 0x00 0x00).
                    // Explicit VR "US" would be 0x55 0x53.

                    if (nextByte === 0x55)
                        throw new Error(
                            "Found Explicit VR 'US' in Implicit write"
                        );
                    // Expect Length 2 (02 00 00 00)
                    if (nextByte === 0x02 && buffer[i + 5] === 0x00)
                        found = true;
                    break;
                }
            }
            expect(found).toBe(true);
        });

        it("should write Explicit VR Big Endian", () => {
            const buffer = write(dataset, {
                transferSyntax: "1.2.840.10008.1.2.2",
            });
            // Note: Our parser might not support Big Endian parsing fully yet used in auto-detect?
            // But we can check bytes manually.

            // Rows Tag: 0028, 0010.
            // Big Endian Tag: 00 28 00 10.

            let found = false;
            for (let i = 132; i < buffer.length - 8; i++) {
                if (
                    buffer[i] === 0x00 &&
                    buffer[i + 1] === 0x28 &&
                    buffer[i + 2] === 0x00 &&
                    buffer[i + 3] === 0x10
                ) {
                    // Found tag.
                    // Explicit VR "US" -> 55 53.
                    // Length 2 -> 00 02 (Big Endian length).
                    if (buffer[i + 4] === 0x55 && buffer[i + 5] === 0x53) {
                        if (buffer[i + 6] === 0x00 && buffer[i + 7] === 0x02) {
                            found = true;
                            // Value 512 = 0x0200.
                            // BE: 02 00.
                            // buffer[i+8] should be 02.
                            expect(buffer[i + 8]).toBe(0x02);
                            expect(buffer[i + 9]).toBe(0x00);
                        }
                    }
                    break;
                }
            }
            expect(found).toBe(true);
        });
    });

    describe("Charset Support", () => {
        it("should decode ISO_IR 100 (Latin1) correctly", () => {
            // Text: "München" in Latin1
            // M (4D), ü (FC), n (6E), c (63), h (68), e (65), n (6E)
            const latin1Bytes = new Uint8Array([
                0x4d, 0xfc, 0x6e, 0x63, 0x68, 0x65, 0x6e,
            ]);

            const buffer = new ArrayBuffer(latin1Bytes.length);
            new Uint8Array(buffer).set(latin1Bytes);
            const safeView = new SafeDataView(buffer);

            // "ISO_IR 100" -> Latin1
            const decoded = safeView.readString(
                latin1Bytes.length,
                "ISO_IR 100"
            );
            expect(decoded).toBe("München");
        });

        it("should decode ISO_IR 144 (Cyrillic) correctly", () => {
            // Text: "Д" (D) in ISO-8859-5 is 0xB4
            const bytes = new Uint8Array([0xb4]);
            const buffer = new ArrayBuffer(bytes.length);
            new Uint8Array(buffer).set(bytes);
            const safeView = new SafeDataView(buffer);

            const decoded = safeView.readString(bytes.length, "ISO_IR 144");
            expect(decoded).toBe("Д");
        });
    });
});
