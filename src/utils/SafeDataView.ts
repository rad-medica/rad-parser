/**
 * SafeDataView: Safe byte reading wrapper
 *
 * Provides bounds-checked byte reading operations for DICOM parsing.
 */

import { findSequenceDelimiterWasm } from "../core/wasm-opt";

/**
 * DataView wrapper for safe byte reading
 */
export class SafeDataView {
    private view: DataView;
    private offset: number;
    private littleEndian: boolean;

    constructor(
        buffer: ArrayBuffer,
        byteOffset: number = 0,
        byteLength?: number
    ) {
        this.view = new DataView(buffer, byteOffset, byteLength);
        this.offset = 0;
        this.littleEndian = true; // Default to little endian
    }

    setEndianness(littleEndian: boolean): void {
        this.littleEndian = littleEndian;
    }

    get byteLength(): number {
        return this.view.byteLength;
    }

    getPosition(): number {
        return this.offset;
    }

    setPosition(position: number): void {
        if (position < 0 || position > this.view.byteLength) {
            throw new Error(
                `Position ${position} out of bounds (max: ${this.view.byteLength})`
            );
        }
        this.offset = position;
    }

    getRemainingBytes(): number {
        return this.view.byteLength - this.offset;
    }

    readUint8(): number {
        if (this.offset >= this.view.byteLength) {
            throw new Error(`Read beyond buffer at offset ${this.offset}`);
        }
        const value = this.view.getUint8(this.offset);
        this.offset += 1;
        return value;
    }

    readUint16(): number {
        if (this.offset + 2 > this.view.byteLength) {
            throw new Error(`Read beyond buffer at offset ${this.offset}`);
        }
        const value = this.view.getUint16(this.offset, this.littleEndian);
        this.offset += 2;
        return value;
    }

    readUint32(): number {
        if (this.offset + 4 > this.view.byteLength) {
            throw new Error(`Read beyond buffer at offset ${this.offset}`);
        }
        const value = this.view.getUint32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
    }

    readInt16(): number {
        if (this.offset + 2 > this.view.byteLength) {
            throw new Error(`Read beyond buffer at offset ${this.offset}`);
        }
        const value = this.view.getInt16(this.offset, this.littleEndian);
        this.offset += 2;
        return value;
    }

    readInt32(): number {
        if (this.offset + 4 > this.view.byteLength) {
            throw new Error(`Read beyond buffer at offset ${this.offset}`);
        }
        const value = this.view.getInt32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
    }

    readFloat32(): number {
        if (this.offset + 4 > this.view.byteLength) {
            throw new Error(`Read beyond buffer at offset ${this.offset}`);
        }
        const value = this.view.getFloat32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
    }

    readFloat64(): number {
        if (this.offset + 8 > this.view.byteLength) {
            throw new Error(`Read beyond buffer at offset ${this.offset}`);
        }
        const value = this.view.getFloat64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
    }

    readBytes(length: number): Uint8Array {
        if (this.offset + length > this.view.byteLength) {
            throw new Error(
                `Read beyond buffer: need ${length} bytes at offset ${this.offset}, have ${this.view.byteLength - this.offset}`
            );
        }
        const bytes = new Uint8Array(
            this.view.buffer,
            this.view.byteOffset + this.offset,
            length
        );
        this.offset += length;
        return bytes;
    }

    readString(length: number, characterSet: string = "ISO_IR 192"): string {
        const bytes = this.readBytes(length);
        // Remove null terminators and trailing spaces
        let end = bytes.length;
        while (end > 0 && (bytes[end - 1] === 0 || bytes[end - 1] === 32)) {
            end--;
        }

        // Decode based on character set
        return decodeString(bytes.slice(0, end), characterSet);
    }

    peekUint16(): number {
        if (this.offset + 2 > this.view.byteLength) {
            throw new Error(`Peek beyond buffer at offset ${this.offset}`);
        }
        return this.view.getUint16(this.offset, this.littleEndian);
    }

    peekUint32(): number {
        if (this.offset + 4 > this.view.byteLength) {
            throw new Error(`Peek beyond buffer at offset ${this.offset}`);
        }
        return this.view.getUint32(this.offset, this.littleEndian);
    }

    /**
     * Skip until Sequence Delimiter Item (FF FE E0 DD).
     * Uses WASM if available, otherwise optimized JS implementation.
     * Returns true if found and positioned after it, false if EOF reached.
     */
    skipUndefinedLength(limit: number): boolean {
        // Try WASM optimization first
        const buffer = new Uint8Array(
            this.view.buffer,
            this.view.byteOffset + this.offset,
            Math.min(limit, this.view.byteLength - this.offset)
        );

        const offset = findSequenceDelimiterWasm(buffer);
        if (offset !== null) {
            this.offset += offset + 8;
            if (this.offset > this.view.byteLength) {
                this.offset = this.view.byteLength;
            }
            return true;
        }

        // JS Fallback
        const maxPos = Math.min(this.view.byteLength, this.offset + limit);
        let pos = 0; // Relative to buffer start

        while (pos <= buffer.length - 4) {
            const idx = buffer.indexOf(0xfe, pos);
            if (idx === -1) {
                this.offset = maxPos;
                return false;
            }

            const matchPos = idx;
            if (matchPos > buffer.length - 4) {
                this.offset = maxPos;
                return false;
            }

            if (
                buffer[matchPos + 1] === 0xff &&
                buffer[matchPos + 2] === 0xdd &&
                buffer[matchPos + 3] === 0xe0
            ) {
                this.offset += matchPos + 8;
                return true;
            }
            pos = matchPos + 1;
        }

        this.offset = maxPos;
        return false;
    }
}

/**
 * Decode string based on DICOM character set
 */
const decoderCache = new Map<string, TextDecoder>();

const DICOM_CHARSET_MAPPING: Record<string, string> = {
    // Default
    "ISO_IR 6": "utf-8", // Default (ASCII), mapped to UTF-8 for compatibility
    "ISO_IR 192": "utf-8",
    "UTF-8": "utf-8",

    // Latin 1-5 (Western, Eastern, Southern, Northern, Turkish)
    "ISO_IR 100": "windows-1252", // Latin1
    "ISO 2022 IR 100": "windows-1252",
    "ISO_IR 101": "iso-8859-2", // Latin2
    "ISO 2022 IR 101": "iso-8859-2",
    "ISO_IR 109": "iso-8859-3", // Latin3
    "ISO 2022 IR 109": "iso-8859-3",
    "ISO_IR 110": "iso-8859-4", // Latin4
    "ISO 2022 IR 110": "iso-8859-4",
    "ISO_IR 148": "iso-8859-9", // Latin5
    "ISO 2022 IR 148": "iso-8859-9",

    // Cyrillic
    "ISO_IR 144": "iso-8859-5",
    "ISO 2022 IR 144": "iso-8859-5",

    // Arabic
    "ISO_IR 127": "iso-8859-6",
    "ISO 2022 IR 127": "iso-8859-6",

    // Greek
    "ISO_IR 126": "iso-8859-7",
    "ISO 2022 IR 126": "iso-8859-7",

    // Hebrew
    "ISO_IR 138": "iso-8859-8",
    "ISO 2022 IR 138": "iso-8859-8",

    // Thai
    "ISO_IR 166": "iso-8859-11", // Might need 'windows-874' in some envs
    "ISO 2022 IR 166": "iso-8859-11",

    // Japanese
    "ISO_IR 13": "shift_jis",
    "ISO 2022 IR 13": "shift_jis",
    "ISO_IR 87": "iso-2022-jp", // JIS X 0208
    "ISO 2022 IR 87": "iso-2022-jp",

    // Chinese
    GB18030: "gb18030",
    "ISO_IR 58": "gb2312",

    // Korean
    "ISO_IR 149": "euc-kr",
    "ISO 2022 IR 149": "euc-kr",
};

function getDecoder(characterSet: string): TextDecoder {
    const key = characterSet.toUpperCase().trim();

    // Check cache first
    if (decoderCache.has(key)) {
        return decoderCache.get(key)!;
    }

    // Resolve label
    let label = "utf-8";

    // Direct lookup
    const mappedLabel = DICOM_CHARSET_MAPPING[key];
    if (mappedLabel) {
        label = mappedLabel;
    } else {
        // Fallback: try to find substring match (e.g. "ISO_IR 100" in "ISO 2022 IR 100")
        for (const [mappingKey, mappingLabel] of Object.entries(
            DICOM_CHARSET_MAPPING
        )) {
            if (key.includes(mappingKey)) {
                label = mappingLabel;
                break;
            }
        }
    }

    let decoder: TextDecoder;
    try {
        decoder = new TextDecoder(label);
    } catch {
        // Fallback if environment doesn't support the encoding
        // eslint-disable-next-line no-console
        console.warn(
            `TextDecoder encoding '${label}' not supported, falling back to UTF-8`
        );
        decoder = new TextDecoder("utf-8");
    }

    decoderCache.set(key, decoder);
    return decoder;
}

function decodeString(bytes: Uint8Array, characterSet: string): string {
    try {
        return getDecoder(characterSet).decode(bytes);
    } catch {
        // Fallback to manual ASCII conversion
        let str = "";
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            if (b !== undefined) str += String.fromCharCode(b);
        }
        return str;
    }
}
