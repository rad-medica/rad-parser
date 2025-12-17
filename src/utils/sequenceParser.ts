/**
 * Sequence Parser: Handles DICOM sequence (SQ) parsing
 *
 * Parses sequences and nested data elements within sequences.
 */

import { createParseError } from "../core/errors";
import type { DicomElement, SequenceItem } from "../core/types";
import {
    parseDAWasm,
    parseDSWasm,
    parseISWasm,
    parsePNWasm,
    parseTMWasm,
} from "../core/wasm-opt";
import { SafeDataView } from "./SafeDataView";
import { parseValueByVR } from "./valueParsers";
import { detectVR, requiresExplicitLength } from "./vrDetection";

/**
 * Parse a sequence item
 */
function parseSequenceItem(
    view: SafeDataView,
    explicitVR: boolean,
    littleEndian: boolean,
    characterSet: string,
    expected: boolean = true,
    enableWasm?: boolean
): SequenceItem | null {
    const startPos = view.getPosition();

    // Read item tag (FFFE, E000)
    if (view.getRemainingBytes() < 8) {
        if (expected) {
            throw createParseError(
                "Unexpected end of data while reading sequence item",
                undefined,
                startPos
            );
        }
        return null;
    }

    const itemGroup = view.readUint16();
    const itemElement = view.readUint16();

    if (itemGroup !== 0xfffe || itemElement !== 0xe000) {
        // Not an item, back up
        view.setPosition(startPos);
        return null;
    }

    // Read item length
    const itemLength = view.readUint32();

    if (itemLength === 0xffffffff) {
        // Undefined length item - parse until item delimiter
        return parseUndefinedLengthItem(
            view,
            explicitVR,
            littleEndian,

            characterSet,
            enableWasm
        );
    }

    if (itemLength === 0) {
        // Empty item
        return { elements: {}, normalizedElements: {} };
    }

    // Parse fixed-length item
    const itemEnd = view.getPosition() + itemLength;
    if (itemEnd > view.byteLength) {
        throw createParseError(
            "Sequence item length out of bounds",
            "xFFFEE000",
            view.getPosition()
        );
    }
    return parseItemElements(
        view,
        explicitVR,
        littleEndian,
        characterSet,
        itemEnd,
        enableWasm
    );
}

/**
 * Parse undefined length item
 */
function parseUndefinedLengthItem(
    view: SafeDataView,
    explicitVR: boolean,
    littleEndian: boolean,
    characterSet: string,

    enableWasm?: boolean
): SequenceItem {
    const elements: Record<string, DicomElement> = {};
    const normalizedElements: Record<string, DicomElement> = {};

    while (view.getRemainingBytes() >= 8) {
        const pos = view.getPosition();

        // Check for item delimiter (FFFE, E00D)
        const group = view.peekUint16();
        if (group === 0xfffe) {
            view.readUint16();
            const element = view.readUint16();
            if (element === 0xe00d) {
                // Item delimiter found
                view.readUint32(); // Read length (should be 0)
                break;
            }
            // Not delimiter, back up
            view.setPosition(pos);
        }

        // Parse element
        const element = parseElement(
            view,
            explicitVR,
            littleEndian,
            characterSet,
            enableWasm
        );
        if (!element) {
            // If we can't parse an element inside an undefined length item, and didn't find delimiter: error
            throw createParseError(
                "Unexpected end of data or invalid tag in undefined length item",
                undefined,
                view.getPosition()
            );
        }

        // Store element
        for (const tag in element.dict) {
            elements[tag] = element.dict[tag];
        }
        for (const tag in element.normalizedElements) {
            normalizedElements[tag] = element.normalizedElements[tag];
        }
    }

    return { elements, normalizedElements };
}

/**
 * Parse item elements until end position
 */
function parseItemElements(
    view: SafeDataView,
    explicitVR: boolean,
    littleEndian: boolean,
    characterSet: string,
    endPos: number,
    enableWasm?: boolean
): SequenceItem {
    const elements: Record<string, DicomElement> = {};
    const normalizedElements: Record<string, DicomElement> = {};

    while (view.getPosition() < endPos && view.getRemainingBytes() >= 8) {
        const element = parseElement(
            view,
            explicitVR,
            littleEndian,
            characterSet,
            enableWasm
        );
        if (!element) {
            break;
        }

        // Store element
        for (const tag in element.dict) {
            elements[tag] = element.dict[tag];
        }
        for (const tag in element.normalizedElements) {
            normalizedElements[tag] = element.normalizedElements[tag];
        }
    }

    return { elements, normalizedElements };
}

/**
 * Parse a single element (used recursively for sequences)
 */
function parseElement(
    view: SafeDataView,
    explicitVR: boolean,
    littleEndian: boolean,
    characterSet: string,
    enableWasm?: boolean
): {
    dict: Record<string, DicomElement>;
    normalizedElements: Record<string, DicomElement>;
} | null {
    if (view.getRemainingBytes() < 8) {
        return null;
    }

    // Read tag
    const group = view.readUint16();
    const element = view.readUint16();

    // Check for delimiters
    if (group === 0xfffe && element === 0xe0dd) {
        // Sequence delimiter
        view.readUint32(); // Read length (should be 0)
        return null;
    }

    if (group === 0xfffe && element === 0xe00d) {
        // Item delimiter
        view.readUint32(); // Read length (should be 0)
        return null;
    }

    // Read VR
    let vr = "UN";
    let length: number;

    if (explicitVR) {
        const vrBytes = view.readBytes(2);
        vr = String.fromCharCode(vrBytes[0], vrBytes[1]);

        if (requiresExplicitLength(vr)) {
            view.readUint16(); // Skip reserved bytes
            length = view.readUint32();
        } else {
            length = view.readUint16();
        }
    } else {
        // Implicit VR
        length = view.readUint32();
        vr = detectVR(group, element);
    }

    // Handle sequences recursively
    if (vr === "SQ" || length === 0xffffffff) {
        const sequence = parseSequence(
            view,
            explicitVR,
            littleEndian,
            characterSet,

            length === 0xffffffff,
            enableWasm
        );
        const tagHex = `x${group.toString(16).padStart(4, "0")}${element.toString(16).padStart(4, "0")}`;

        const elementData: DicomElement = {
            vr: "SQ",
            VR: "SQ",
            Value: sequence as unknown as
                | Array<string | number>
                | Record<string, unknown>,
            value: sequence as unknown as
                | Array<string | number>
                | Record<string, unknown>,
            length: length === 0xffffffff ? undefined : length,
            Length: length === 0xffffffff ? undefined : length,
            items: sequence as unknown[],
            Items: sequence as unknown[],
        };

        return {
            dict: {
                [tagHex]: elementData,
            },
            normalizedElements: {
                [tagHex]: elementData,
            },
        };
    }

    // Parse value
    let value: unknown;

    if (length > 0 && view.getRemainingBytes() >= length) {
        const maxSize = 50000000;
        if (length > maxSize) {
            // Skip large element but continue
            view.setPosition(view.getPosition() + length);
            return { dict: {}, normalizedElements: {} };
        }

        try {
            value = parseElementValue(
                view,
                vr,
                length,
                characterSet,
                enableWasm
            );
        } catch {
            view.readBytes(length);
            return null;
        }
    } else if (length === 0) {
        value = undefined;
    } else {
        // Not enough bytes
        return null;
    }

    // Format tag
    const tagHex = `x${group.toString(16).padStart(4, "0")}${element.toString(16).padStart(4, "0")}`;

    // Create element with both uppercase and lowercase keys
    const elementData: DicomElement = {
        vr,
        VR: vr,
        Value: value as
            | string
            | number
            | Array<string | number>
            | Record<string, unknown>,
        value: value as
            | string
            | number
            | Array<string | number>
            | Record<string, unknown>,
        length: length,
        Length: length,
        items: undefined,
        Items: undefined,
    };

    return {
        dict: {
            [tagHex]: elementData,
        },
        normalizedElements: {
            [tagHex]: elementData,
        },
    };
}

/**
 * Parse element value based on VR
 */
function parseElementValue(
    view: SafeDataView,
    vr: string,
    length: number,
    characterSet: string,

    enableWasm?: boolean
): unknown {
    if (
        vr === "OB" ||
        vr === "OW" ||
        vr === "OF" ||
        vr === "OD" ||
        vr === "OL" ||
        vr === "UN"
    ) {
        // Binary data
        const bytes = view.readBytes(length);
        return Array.from(bytes);
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

    // String-based VR
    if (enableWasm) {
        if (vr === "PN") {
            const str = view.readString(length, characterSet);
            const res = parsePNWasm(str);
            if (res) return res;
            return str;
        }
        if (vr === "DA") {
            const str = view.readString(length, characterSet);
            const res = parseDAWasm(str);
            if (res) return res;
            return str;
        }
        if (vr === "TM") {
            const str = view.readString(length, characterSet);
            const res = parseTMWasm(str);
            if (res) return res;
            return str;
        }
        if (vr === "DS") {
            const bytes = view.readBytes(length);
            const res = parseDSWasm(bytes);
            if (res) return res;
            // Fallback to JS
            const str = new TextDecoder().decode(bytes);
            const parts = str.split("\\").filter(p => p.trim());
            if (parts.length === 1) {
                const num = parseFloat(parts[0]);
                return isNaN(num) ? str : num;
            }
            return parts.map(p => {
                const num = parseFloat(p.trim());
                return isNaN(num) ? p.trim() : num;
            });
        }
        if (vr === "IS") {
            const bytes = view.readBytes(length);
            const res = parseISWasm(bytes);
            if (res) return res;
            // Fallback to JS
            const str = new TextDecoder().decode(bytes);
            const parts = str.split("\\").filter(p => p.trim());
            if (parts.length === 1) {
                const num = parseFloat(parts[0]);
                return isNaN(num) ? str : Math.floor(num);
            }
            return parts.map(p => {
                const num = parseFloat(p.trim());
                return isNaN(num) ? p.trim() : num;
            });
        }
    }
    const str = view.readString(length, characterSet);

    // Parse based on VR type
    if (
        vr === "IS" ||
        vr === "SL" ||
        vr === "SS" ||
        vr === "UL" ||
        vr === "US"
    ) {
        // Numeric types
        const parts = str.split("\\").filter(p => p.trim());
        if (parts.length === 1) {
            const num = parseFloat(parts[0]);
            return isNaN(num)
                ? str
                : vr === "US" || vr === "UL"
                  ? Math.floor(num)
                  : Math.floor(num);
        }
        return parts.map(p => {
            const num = parseFloat(p.trim());
            return isNaN(num) ? p.trim() : num;
        });
    }

    if (vr === "DS" || vr === "FL" || vr === "FD") {
        // Floating point types
        const parts = str.split("\\").filter(p => p.trim());
        if (parts.length === 1) {
            const num = parseFloat(parts[0]);
            return isNaN(num) ? str : num;
        }
        return parts.map(p => {
            const num = parseFloat(p.trim());
            return isNaN(num) ? p.trim() : num;
        });
    }

    // Use specialized parsers for special VR types
    if (
        vr === "PN" ||
        vr === "DA" ||
        vr === "TM" ||
        vr === "DT" ||
        vr === "AS"
    ) {
        return parseValueByVR(vr, str);
    }

    // String types
    const parts = str.split("\\");
    return parts.length === 1 ? parts[0] : parts;
}

/**
 * Parse a sequence
 */
export function parseSequence(
    view: SafeDataView,
    explicitVR: boolean,
    littleEndian: boolean,
    characterSet: string,
    undefinedLength: boolean,
    enableWasm?: boolean
): SequenceItem[] {
    const items: SequenceItem[] = [];

    if (undefinedLength) {
        // Parse until sequence delimiter

        while (view.getRemainingBytes() >= 8) {
            const pos = view.getPosition();

            // Check for sequence delimiter (FFFE, E0DD)
            const group = view.peekUint16();
            if (group === 0xfffe) {
                view.readUint16();
                const element = view.readUint16();
                if (element === 0xe0dd) {
                    // Sequence delimiter found
                    view.readUint32(); // Read length (should be 0)
                    break;
                }
                // Not delimiter, back up
                view.setPosition(pos);
            }

            // Parse item
            const item = parseSequenceItem(
                view,
                explicitVR,
                littleEndian,

                characterSet,
                true,
                enableWasm
            );
            if (!item) {
                break;
            }
            items.push(item);
        }
    } else {
        // Parse fixed-length sequence
        const endPos =
            view.getPosition() +
            (view.getRemainingBytes() > 0 ? view.getRemainingBytes() : 0);
        while (view.getPosition() < endPos && view.getRemainingBytes() >= 8) {
            const item = parseSequenceItem(
                view,
                explicitVR,
                littleEndian,
                characterSet,
                true,
                enableWasm
            );
            if (!item) {
                break;
            }
            items.push(item);
        }
    }

    return items;
}
