/**
 * DICOM Transfer Syntax Utilities
 *
 * Provides constants and helper functions for working with DICOM Transfer Syntaxes.
 */

/**
 * DICOM Transfer Syntax UIDs
 * Reference: DICOM PS3.5 Table 10.1
 */
export const TRANSFER_SYNTAX = {
    // Uncompressed
    IMPLICIT_VR_LITTLE_ENDIAN: "1.2.840.10008.1.2",
    EXPLICIT_VR_LITTLE_ENDIAN: "1.2.840.10008.1.2.1",
    EXPLICIT_VR_BIG_ENDIAN: "1.2.840.10008.1.2.2",
    DEFLATED_EXPLICIT_VR_LITTLE_ENDIAN: "1.2.840.10008.1.2.1.99",

    // JPEG
    JPEG_BASELINE: "1.2.840.10008.1.2.4.50",
    JPEG_EXTENDED: "1.2.840.10008.1.2.4.51",
    JPEG_LOSSLESS: "1.2.840.10008.1.2.4.57",
    JPEG_LOSSLESS_SV1: "1.2.840.10008.1.2.4.70",

    // JPEG 2000
    JPEG_2000_LOSSLESS: "1.2.840.10008.1.2.4.90",
    JPEG_2000: "1.2.840.10008.1.2.4.91",

    // JPEG-LS
    JPEG_LS_LOSSLESS: "1.2.840.10008.1.2.4.80",
    JPEG_LS: "1.2.840.10008.1.2.4.81",

    // RLE
    RLE_LOSSLESS: "1.2.840.10008.1.2.5",

    // PDF Embedded (Encapsulated PDF)
    PDF_EMBEDDED: "1.2.840.10008.1.2.1.104.1",
} as const;

export type TransferSyntaxUID =
    (typeof TRANSFER_SYNTAX)[keyof typeof TRANSFER_SYNTAX];

// Max bytes to scan in raw mode for metadata
const RAW_SCAN_LIMIT = 256 * 1024; // 256KB

// List of VRs that use 32-bit length (Explicit VR)
// OB, OW, OF, OD, OL, OV, SQ, UN, UC, UR, UT, UV, SV
const LONG_VR_CODES = new Set([
    0x4f42, // OB
    0x4f57, // OW
    0x4f46, // OF
    0x4f44, // OD
    0x4f4c, // OL
    0x4f56, // OV
    0x5351, // SQ
    0x554e, // UN
    0x5543, // UC
    0x5552, // UR
    0x5554, // UT
    0x5556, // UV
    0x5356, // SV
]);

/**
 * Find transfer syntax in raw DICOM (non-Part 10) file
 */
function findTransferSyntaxInRawDicom(byteArray: Uint8Array): string | null {
    const limit = Math.min(byteArray.length - 8, RAW_SCAN_LIMIT);

    for (let i = 0; i < limit; i++) {
        // Little Endian reading
        const group = byteArray[i]! | (byteArray[i + 1]! << 8);

        // Optimization: If we passed group 0x0002, we can stop searching.
        // Tags are strictly monotonic in DICOM.
        if (group > 0x0002) {
            return null;
        }

        const element = byteArray[i + 2]! | (byteArray[i + 3]! << 8);

        if (group === 0x0002 && element === 0x0010) {
            // Found Transfer Syntax UID
            // VR is at +4, +5
            const vrCode = (byteArray[i + 4]! << 8) | byteArray[i + 5]!; // Big Endian representation for readable hex?
            // Actually standard LE char codes: byteArray[4] is 1st char, byteArray[5] is 2nd.
            // Let's use combined 16-bit for fast lookup.
            // 'OB' -> O=0x4f, B=0x42. Little endian in file: 0x4f, 0x42.
            // As Uint16 LE: 0x424f. But simpler to just read bytes.

            const vr0 = byteArray[i + 4]!;
            const vr1 = byteArray[i + 5]!;
            const vrCodeBE = (vr0 << 8) | vr1;

            let length: number;
            let valueOffset: number;

            if (LONG_VR_CODES.has(vrCodeBE)) {
                // Explicit VR long: Length is 32-bit at i+8
                if (i + 12 > byteArray.length) return null;
                length =
                    byteArray[i + 8]! |
                    (byteArray[i + 9]! << 8) |
                    (byteArray[i + 10]! << 16) |
                    (byteArray[i + 11]! << 24);
                valueOffset = i + 12;
            } else {
                // Explicit VR short: Length is 16-bit at i+6
                length = byteArray[i + 6]! | (byteArray[i + 7]! << 8);
                valueOffset = i + 8;
            }

            return readUIDInPlace(byteArray, valueOffset, length);
        }
    }
    return null;
}

/**
 * Safely read a string/UID from the byte array with trimming
 */
function readUIDInPlace(
    byteArray: Uint8Array,
    offset: number,
    length: number
): string | null {
    if (length <= 0 || offset + length > byteArray.length) {
        return null;
    }

    // Remove trailing nulls (0x00) or spaces (0x20)
    let end = offset + length;
    while (
        end > offset &&
        (byteArray[end - 1]! === 0 || byteArray[end - 1]! === 32)
    ) {
        end--;
    }

    // Optimization: Use sub-array to avoid copying if TextDecoder supports it,
    // or fallback to slice which is safer for compatibility.
    // Using a loop for short ASCII strings (UIDs) is faster than TextDecoder overhead often.
    let uid = "";
    for (let k = offset; k < end; k++) {
        uid += String.fromCharCode(byteArray[k]!);
    }
    return uid;
}

/**
 * Extract transfer syntax UID from DICOM file
 */
export function extractTransferSyntax(byteArray: Uint8Array): string | null {
    try {
        // Check for DICOM Part 10 file (starts with DICM at offset 128)
        if (byteArray.length < 132) {
            return findTransferSyntaxInRawDicom(byteArray);
        }

        // Check for DICM signature at offset 128
        // Check bytes directly to avoid string allocation
        if (
            byteArray[128] !== 68 || // D
            byteArray[129] !== 73 || // I
            byteArray[130] !== 67 || // C
            byteArray[131] !== 77 // M
        ) {
            return findTransferSyntaxInRawDicom(byteArray);
        }

        // Part 10 file - Transfer Syntax is at tag (0002,0010) in File Meta Information
        // File Meta Information is always Explicit VR Little Endian
        let offset = 132;
        const limit = byteArray.length;

        while (offset < limit - 8) {
            // Little Endian reading of Group/Element
            const group = byteArray[offset]! | (byteArray[offset + 1]! << 8);

            // If we exited Group 2, the meta header is over
            if (group !== 0x0002) {
                break;
            }

            const element =
                byteArray[offset + 2]! | (byteArray[offset + 3]! << 8);

            const vr0 = byteArray[offset + 4]!;
            const vr1 = byteArray[offset + 5]!;
            const vrCodeBE = (vr0 << 8) | vr1;

            let length: number;
            let valueOffset: number;
            let nextTagOffset: number;

            // Determine length format based on VR
            if (LONG_VR_CODES.has(vrCodeBE)) {
                // Reserved (2b) + Length (4b)
                if (offset + 12 > limit) break;
                length =
                    byteArray[offset + 8]! |
                    (byteArray[offset + 9]! << 8) |
                    (byteArray[offset + 10]! << 16) |
                    (byteArray[offset + 11]! << 24);
                valueOffset = offset + 12;
                nextTagOffset = offset + 12 + length;
            } else {
                // Length (2b)
                length = byteArray[offset + 6]! | (byteArray[offset + 7]! << 8);
                valueOffset = offset + 8;
                nextTagOffset = offset + 8 + length;
            }

            // Found Transfer Syntax tag (0002,0010)
            if (element === 0x0010) {
                return readUIDInPlace(byteArray, valueOffset, length);
            }

            // Move to next tag
            offset = nextTagOffset;

            // Sanity check to avoid infinite loops if length is 0 (though allowed, usually means empty value)
            // or if corrupted length causes stuck pointer (offset should strictly increase)
            if (length < 0) break; // Should not happen with unsigned but logical check
        }
    } catch (error) {
        // Silently fail or log to console if needed
        // process.env check might fail in browser/strict env, so just warn if it's not a common expected failure?
        // Actually, for a library, we should probably just return null as defined by API.
        // But user asked for error handling.
        // console.warn is fine.
        // To match user environment constraints (linux, maybe node), process is fine, but lets avoid lint error.
        try {
            if (
                typeof process !== "undefined" &&
                process.env &&
                process.env.NODE_ENV !== "production"
            ) {
                console.warn("Failed to extract transfer syntax:", error);
            }
        } catch {
            // Ignored
        }
    }

    return null;
}
