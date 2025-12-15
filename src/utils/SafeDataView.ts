/**
 * SafeDataView: Safe byte reading wrapper
 *
 * Provides bounds-checked byte reading operations for DICOM parsing.
 */

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
        byteLength?: number,
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
                `Position ${position} out of bounds (max: ${this.view.byteLength})`,
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
                `Read beyond buffer: need ${length} bytes at offset ${this.offset}, have ${this.view.byteLength - this.offset}`,
            );
        }
        const bytes = new Uint8Array(
            this.view.buffer,
            this.view.byteOffset + this.offset,
            length,
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
}

/**
 * Decode string based on DICOM character set
 */
const decoderCache = new Map<string, TextDecoder>();

function getDecoder(characterSet: string): TextDecoder {
    const key = characterSet.toUpperCase();
    if (decoderCache.has(key)) {
        return decoderCache.get(key)!;
    }

    let label: string;
    if (key.includes("ISO_IR 192") || key.includes("UTF-8")) {
        label = "utf-8";
    } else if (key.includes("ISO_IR 100") || key.includes("ISO 2022 IR 100")) {
        label = "latin1";
    } else {
        label = "utf-8";
    }

    const decoder = new TextDecoder(label);
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
            str += String.fromCharCode(bytes[i]);
        }
        return str;
    }
}
