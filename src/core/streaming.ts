/**
 * Streaming Parser: Handles incremental parsing of DICOM files
 *
 * Supports parsing DICOM files in chunks for memory-efficient processing
 * of very large files.
 */

import type { DicomElement } from "./types";
import { SafeDataView } from "../utils/SafeDataView";
import {
    detectVR,
    detectVRForPrivateTag,
    requiresExplicitLength,
} from "../utils/vrDetection";
import { parseValueByVR } from "../utils/valueParsers";
import { parseSequence } from "../utils/sequenceParser";
import { extractPixelDataFromView } from "../utils/pixelData";
import { isPrivateTag } from "../utils/dictionary";

/**
 * Hex string cache for fast tag formatting (module-level for reuse)
 */
const hexCache: string[] = [];
for (let i = 0; i < 65536; i++) {
    hexCache[i] = i.toString(16).padStart(4, "0");
}

/**
 * Streaming parser state
 */
interface StreamingState {
    buffer: Uint8Array;
    offset: number;
    explicitVR: boolean;
    littleEndian: boolean;
    characterSet: string;
    transferSyntax?: string;
    isDicomPart10: boolean;
    initialized: boolean;
    pendingElement?: {
        group: number;
        element: number;
        vr?: string;
        length?: number;
        bytesRead: number;
        data: Uint8Array;
    };
}

/**
 * Parsed element callback
 */
export type ElementCallback = (element: {
    dict: Record<string, DicomElement>;
    normalizedElements: Record<string, DicomElement>;
}) => void;

/**
 * Streaming parser options
 */
export interface StreamingOptions {
    onElement?: ElementCallback;
    onError?: (error: Error) => void;
    maxBufferSize?: number; // Maximum buffer size before flushing (default: 10MB)
    maxIterations?: number; // Maximum elements to parse per chunk (default: 1000)
}

/**
 * Streaming DICOM parser
 */
export class StreamingParser {
    private state: StreamingState;
    private options: Required<
        Pick<StreamingOptions, "maxBufferSize" | "maxIterations">
    > &
        Pick<StreamingOptions, "onElement" | "onError">;

    constructor(options: StreamingOptions = {}) {
        this.options = {
            maxBufferSize: options.maxBufferSize ?? 10 * 1024 * 1024, // 10MB
            maxIterations: options.maxIterations ?? 1000,
            onElement: options.onElement,
            onError: options.onError,
        };

        this.state = {
            buffer: new Uint8Array(0),
            offset: 0,
            explicitVR: true,
            littleEndian: true,
            characterSet: "ISO_IR 192",
            isDicomPart10: false,
            initialized: false,
        };
    }

    /**
     * Initialize parser with first chunk
     */
    initialize(chunk: Uint8Array): void {
        if (this.state.initialized) {
            throw new Error("Parser already initialized");
        }

        // Check for DICM magic string
        if (chunk.length >= 132) {
            const magic = chunk.slice(128, 132);
            const magicString = String.fromCharCode(...magic);
            if (magicString === "DICM") {
                this.state.isDicomPart10 = true;
                this.state.offset = 132;
            }
        }

        // Read transfer syntax from meta information if Part 10
        if (this.state.isDicomPart10 && chunk.length >= 200) {
            try {
                // Ensure ArrayBuffer
                let buffer: ArrayBuffer;
                const sourceBuffer = chunk.buffer;
                if (sourceBuffer instanceof ArrayBuffer) {
                    buffer = sourceBuffer.slice(
                        chunk.byteOffset + this.state.offset
                    );
                } else {
                    // SharedArrayBuffer - copy to new ArrayBuffer
                    const length = chunk.length - this.state.offset;
                    buffer = new ArrayBuffer(length);
                    const dest = new Uint8Array(buffer);
                    const src = chunk.slice(this.state.offset);
                    dest.set(src);
                }
                const metaView = new SafeDataView(buffer, 0);
                metaView.setEndianness(true);
                const metaInfo = this.readMetaInformation(metaView);
                this.state.transferSyntax = metaInfo.transferSyntax;
                this.state.offset += metaView.getPosition();

                // Determine endianness and VR type
                if (this.state.transferSyntax === "1.2.840.10008.1.2") {
                    this.state.explicitVR = false;
                    this.state.littleEndian = true;
                } else if (
                    this.state.transferSyntax === "1.2.840.10008.1.2.2"
                ) {
                    this.state.explicitVR = true;
                    this.state.littleEndian = false;
                } else {
                    this.state.explicitVR = true;
                    this.state.littleEndian = true;
                }
            } catch {
                // Use defaults
            }
        }

        this.state.buffer = chunk;
        this.state.initialized = true;
    }

    /**
     * Process a chunk of data
     */
    processChunk(chunk: Uint8Array): void {
        // Optimized buffer appending: grow buffer efficiently
        const currentLength = this.state.buffer.length;
        const newLength = currentLength + chunk.length;

        // Check buffer size limit
        if (newLength > this.options.maxBufferSize) {
            if (this.options.onError) {
                this.options.onError(
                    new Error(
                        `Buffer size exceeded limit: ${newLength} > ${this.options.maxBufferSize}`
                    )
                );
            }
            return;
        }

        // Optimized buffer growth strategy
        if (this.state.buffer.length === 0) {
            // First chunk - allocate with headroom (2x) to reduce reallocations
            const initialSize = Math.min(
                Math.max(chunk.length * 2, 16384),
                this.options.maxBufferSize
            );
            const newBuffer = new Uint8Array(initialSize);
            newBuffer.set(chunk, 0);
            this.state.buffer = newBuffer.subarray(0, chunk.length);
        } else {
            // Check if we can reuse the underlying buffer (faster path)
            const bufferByteLength = this.state.buffer.buffer.byteLength;
            const bufferByteOffset = this.state.buffer.byteOffset;
            const actualUsedLength = this.state.buffer.length;
            const availableCapacity =
                bufferByteLength - bufferByteOffset - actualUsedLength;

            if (availableCapacity >= chunk.length) {
                // Fast path: append in-place to existing buffer (no allocation)
                const underlyingView = new Uint8Array(
                    this.state.buffer.buffer,
                    bufferByteOffset + actualUsedLength,
                    chunk.length
                );
                underlyingView.set(chunk);
                // Update buffer view to include new data
                this.state.buffer = new Uint8Array(
                    this.state.buffer.buffer,
                    bufferByteOffset,
                    newLength
                );
            } else {
                // Need to grow - use 1.5x growth factor with minimum growth
                const growSize = Math.min(
                    Math.max(newLength, Math.floor(currentLength * 1.5)),
                    this.options.maxBufferSize
                );
                const newBuffer = new Uint8Array(growSize);
                // Copy existing data (only unprocessed portion if offset > 0)
                if (
                    this.state.offset > 0 &&
                    this.state.offset < currentLength
                ) {
                    // Copy only unprocessed data (more efficient)
                    newBuffer.set(
                        this.state.buffer.subarray(this.state.offset),
                        0
                    );
                    this.state.buffer = newBuffer.subarray(
                        0,
                        currentLength - this.state.offset
                    );
                    this.state.offset = 0;
                    // Now append new chunk
                    const appendPos = this.state.buffer.length;
                    newBuffer.set(chunk, appendPos);
                    this.state.buffer = newBuffer.subarray(
                        0,
                        appendPos + chunk.length
                    );
                } else {
                    // Copy all existing data
                    newBuffer.set(this.state.buffer, 0);
                    newBuffer.set(chunk, currentLength);
                    this.state.buffer = newBuffer.subarray(0, newLength);
                }
            }
        }

        if (!this.state.initialized) {
            // Wait for at least 132 bytes to check for DICM preamble
            // If we have less, we can't determine if it's Part 10 or not reliably.
            // Exception: If we decide to support non-Part 10 streams without preamble,
            // we might need a flag or heuristically wait.
            // For now, we wait for 132 bytes.
            if (this.state.buffer.length < 132) {
                return;
            }

            // We have enough data, initialize using the accumulated buffer
            // Note: initialize() expects a 'chunk' but mainly uses it to set buffer.
            // Since we already updated state.buffer, initialize should rely on that or we pass state.buffer.
            // But initialize overwrites state.buffer = chunk.
            // So we pass the FULL buffer to initialize.
            this.initialize(this.state.buffer);

            // initialize() sets state.buffer = chunk. So it's consistent.
            // Now process elements in the buffer
            this.processElements();
            return;
        }

        // Already initialized and buffer updated. Process elements.
        this.processElements();
    }

    /**
     * Finalize parsing (call when all data is received)
     */
    finalize(): void {
        if (!this.state.initialized) {
            // If we haven't initialized yet (e.g. data < 132 bytes total),
            // we must force init now to parse what we have (e.g. valid small non-Part 10 file).
            if (this.state.buffer.length > 0) {
                try {
                    this.initialize(this.state.buffer);
                    this.processElements(true);
                } catch (error) {
                    if (this.options.onError) {
                        this.options.onError(
                            error instanceof Error
                                ? error
                                : new Error(String(error))
                        );
                    }
                }
            }
            return;
        }

        // Process any remaining elements with final=true
        try {
            this.processElements(true);
        } catch (error) {
            if (this.options.onError) {
                this.options.onError(
                    error instanceof Error ? error : new Error(String(error))
                );
            }
        }

        // Clear buffer and reset state
        this.state.buffer = new Uint8Array(0);
        this.state.offset = 0;
        this.state.pendingElement = undefined;
    }

    /**
     * Process elements from buffer
     */
    private processElements(final: boolean = false): void {
        const remainingBytes = this.state.buffer.length - this.state.offset;
        if (remainingBytes < 8) {
            // Not enough data for even a tag
            return;
        }

        // Create view on the remaining unprocessed data
        // This is more efficient than copying the entire buffer
        let view: SafeDataView;
        const sourceBuffer = this.state.buffer.buffer;
        const sliceStart = this.state.buffer.byteOffset + this.state.offset;
        const sliceEnd =
            this.state.buffer.byteOffset + this.state.buffer.length;

        if (sourceBuffer instanceof ArrayBuffer) {
            // Can slice without copying - most efficient
            const slice = sourceBuffer.slice(sliceStart, sliceEnd);
            view = new SafeDataView(slice, 0);
        } else {
            // SharedArrayBuffer - must copy
            const length = remainingBytes;
            const buffer = new ArrayBuffer(length);
            const dest = new Uint8Array(buffer);
            dest.set(this.state.buffer.subarray(this.state.offset));
            view = new SafeDataView(buffer, 0);
        }
        view.setEndianness(this.state.littleEndian);

        let iterations = 0;

        while (
            view.getRemainingBytes() >= 8 &&
            iterations < this.options.maxIterations &&
            this.state.buffer.length < this.options.maxBufferSize
        ) {
            iterations++;

            try {
                const element = this.parseElement(view, final);
                if (!element) {
                    // Element parsing returned null - might need more data
                    // Don't break if we're not final and have pending element
                    if (final || !this.state.pendingElement) {
                        break;
                    }
                    // Continue to next iteration if we have a pending element
                    continue;
                }

                // Emit element
                if (this.options.onElement) {
                    try {
                        this.options.onElement(element);
                    } catch (callbackError) {
                        // Don't break parsing on callback errors
                        if (this.options.onError) {
                            this.options.onError(
                                callbackError instanceof Error
                                    ? callbackError
                                    : new Error(String(callbackError))
                            );
                        }
                    }
                }
            } catch (error) {
                // Improved error handling - try to recover
                const errorMsg =
                    error instanceof Error ? error.message : String(error);

                // Check if it's a recoverable error (bounds, etc.)
                if (
                    errorMsg.includes("bounds") ||
                    errorMsg.includes("remaining")
                ) {
                    // Likely need more data - wait for next chunk
                    if (!final) {
                        break;
                    }
                }

                if (this.options.onError) {
                    this.options.onError(
                        error instanceof Error ? error : new Error(errorMsg)
                    );
                }

                // Only break on non-recoverable errors
                if (final || !errorMsg.includes("bounds")) {
                    break;
                }
            }
        }

        // Update offset by the total amount consumed in this batch
        const consumed = view.getPosition();
        this.state.offset += consumed;

        // Optimize: Trim buffer if we've consumed a significant portion
        // This prevents unbounded buffer growth and improves memory efficiency
        if (
            this.state.offset > 64 * 1024 &&
            this.state.offset > this.state.buffer.length / 2
        ) {
            // Remove processed data from buffer by creating a new buffer with only remaining data
            const remainingLength =
                this.state.buffer.length - this.state.offset;
            if (remainingLength > 0) {
                const remaining = new Uint8Array(remainingLength);
                remaining.set(this.state.buffer.subarray(this.state.offset));
                this.state.buffer = remaining;
                this.state.offset = 0;
            } else {
                this.state.buffer = new Uint8Array(0);
                this.state.offset = 0;
            }
        }
    }

    /**
     * Parse a single element
     */
    private parseElement(
        view: SafeDataView,
        final: boolean
    ): {
        dict: Record<string, DicomElement>;
        normalizedElements: Record<string, DicomElement>;
    } | null {
        if (view.getRemainingBytes() < 8) {
            return null;
        }

        const startPos = view.getPosition();

        // Read tag
        const group = view.readUint16();
        const element = view.readUint16();

        // Check for delimiters
        if (group === 0xfffe && element === 0xe0dd) {
            view.readUint32();
            return null;
        }
        if (group === 0xfffe && element === 0xe00d) {
            view.readUint32();
            return null;
        }

        // Read VR
        let vr = "UN";
        let length: number;

        if (this.state.explicitVR) {
            if (view.getRemainingBytes() < 2) {
                view.setPosition(startPos);
                return null;
            }
            const vrBytes = view.readBytes(2);
            const vr0 = vrBytes[0];
            const vr1 = vrBytes[1];
            vr = String.fromCharCode(vr0, vr1);

            // Fast check for long VRs using char codes (avoid string comparison)
            const isLongVR =
                (vr0 === 0x53 && vr1 === 0x51) || // SQ
                (vr0 === 0x4f && vr1 === 0x42) || // OB
                (vr0 === 0x4f && vr1 === 0x57) || // OW
                (vr0 === 0x4f && vr1 === 0x46) || // OF
                (vr0 === 0x4f && vr1 === 0x44) || // OD
                (vr0 === 0x4f && vr1 === 0x4c) || // OL
                (vr0 === 0x55 && vr1 === 0x4e); // UN

            if (isLongVR) {
                if (view.getRemainingBytes() < 6) {
                    view.setPosition(startPos);
                    return null;
                }
                view.readUint16(); // Reserved
                length = view.readUint32();
            } else {
                if (view.getRemainingBytes() < 2) {
                    view.setPosition(startPos);
                    return null;
                }
                length = view.readUint16();
            }
        } else {
            if (view.getRemainingBytes() < 4) {
                view.setPosition(startPos);
                return null;
            }
            length = view.readUint32();

            // Fast VR detection - use numeric tag comparison
            const tagNum = (group << 16) | element;
            const isPrivate = group % 2 !== 0;
            if (isPrivate) {
                vr = detectVRForPrivateTag(group, element, length);
            } else {
                vr = detectVR(group, element);
            }
        }

        // Optimized tag formatting - use cached hex strings for speed
        const groupHex = hexCache[group] || group.toString(16).padStart(4, "0");
        const elementHex =
            hexCache[element] || element.toString(16).padStart(4, "0");
        const tagHex = `x${groupHex}${elementHex}`;
        const tagComma = `${groupHex},${elementHex}`;
        const tagPlain = `${groupHex}${elementHex}`;

        // Handle sequences
        if (vr === "SQ" || length === 0xffffffff) {
            // For sequences, we need the full data - check if available
            if (length === 0xffffffff) {
                // Undefined length - parse until delimiter
                const sequence = parseSequence(
                    view,
                    this.state.explicitVR,
                    this.state.littleEndian,
                    this.state.characterSet,
                    true
                );

                const elementData: DicomElement = {
                    vr: "SQ",
                    VR: "SQ",
                    Value: sequence as unknown as
                        | Array<string | number>
                        | Record<string, unknown>,
                    value: sequence as unknown as
                        | Array<string | number>
                        | Record<string, unknown>,
                    length: undefined,
                    Length: undefined,
                    items: sequence as unknown[],
                    Items: sequence as unknown[],
                };

                return {
                    dict: { [tagHex]: elementData },
                    normalizedElements: { [tagHex]: elementData },
                };
            } else if (view.getRemainingBytes() >= length) {
                const sequence = parseSequence(
                    view,
                    this.state.explicitVR,
                    this.state.littleEndian,
                    this.state.characterSet,
                    false
                );

                const elementData: DicomElement = {
                    vr: "SQ",
                    VR: "SQ",
                    Value: sequence as unknown as
                        | Array<string | number>
                        | Record<string, unknown>,
                    value: sequence as unknown as
                        | Array<string | number>
                        | Record<string, unknown>,
                    length: length,
                    Length: length,
                    items: sequence as unknown[],
                    Items: sequence as unknown[],
                };

                return {
                    dict: { [tagHex]: elementData },
                    normalizedElements: { [tagHex]: elementData },
                };
            } else {
                // Not enough data - wait for more
                view.setPosition(startPos);
                return null;
            }
        }

        // Check if we have enough data for this element - improved reliability
        const availableBytes = view.getRemainingBytes();
        if (length === 0xffffffff) {
            // Undefined length - handled separately in sequence/pixel data logic
            // Don't check availableBytes here
        } else if (length > 0 && availableBytes < length) {
            if (!final) {
                // Not enough data - wait for more chunks
                // Store partial element state for resumption
                this.state.pendingElement = {
                    group,
                    element,
                    vr,
                    length,
                    bytesRead: 0,
                    data: new Uint8Array(0),
                };
                view.setPosition(startPos);
                return null;
            }
            // Final chunk - handle incomplete elements more gracefully
            if (availableBytes === 0) {
                view.setPosition(startPos);
                return null;
            }

            // Determine if incomplete data is acceptable
            const isPixelData = group === 0x7fe0 && element === 0x0010;
            const isLargeBinary =
                (vr === "OB" ||
                    vr === "OW" ||
                    vr === "OF" ||
                    vr === "OD" ||
                    vr === "OL" ||
                    vr === "UN") &&
                length > 1000;
            const isSequence = vr === "SQ";

            // For sequences, pixel data, and large binary, incomplete might be acceptable
            if (isSequence || isPixelData || isLargeBinary) {
                // Read what we have - might be valid (encapsulated format, etc.)
                length = availableBytes;
            } else {
                // For other elements, incomplete data is likely an error
                // But be more lenient - only warn if very incomplete
                if (this.options.onError && length > availableBytes * 3) {
                    // Only warn if more than 66% missing
                    this.options.onError(
                        new Error(
                            `Incomplete element ${tagHex}: expected ${length} bytes, got ${availableBytes}`
                        )
                    );
                }
                // Still read what we have to continue parsing
                length = availableBytes;
            }
        } else if (this.state.pendingElement) {
            // Clear pending element if we now have enough data
            this.state.pendingElement = undefined;
        }

        // Handle pixel data
        const isPixelData = group === 0x7fe0 && element === 0x0010;
        let value:
            | string
            | number
            | Array<string | number>
            | Record<string, unknown>
            | Uint8Array
            | Array<Uint8Array>
            | undefined = undefined;

        if (isPixelData) {
            const pixelDataResult = extractPixelDataFromView(
                view,
                length,
                this.state.transferSyntax
            );
            if (pixelDataResult) {
                // Export pixel data in compatible format:
                // - Uncompressed: Direct Uint8Array
                // - Encapsulated: Array<Uint8Array> (fragments)
                if (
                    pixelDataResult.isEncapsulated &&
                    pixelDataResult.fragmentArrays &&
                    pixelDataResult.fragmentArrays.length > 0
                ) {
                    // Encapsulated: return array of fragments
                    value = pixelDataResult.fragmentArrays;
                } else {
                    // Uncompressed: return direct Uint8Array
                    value = pixelDataResult.pixelData;
                }
            } else {
                // Skip pixel data if extraction fails
                if (length > 0 && view.getRemainingBytes() >= length) {
                    view.readBytes(length);
                }
                return null;
            }
        } else if (length > 0 && view.getRemainingBytes() >= length) {
            const maxSize = 10000000; // 10MB limit
            if (length > maxSize) {
                view.readBytes(maxSize);
                return null;
            }

            try {
                value = this.parseElementValue(view, vr, length);
            } catch {
                view.readBytes(length);
                return null;
            }
        } else if (length === 0) {
            value = undefined;
        }

        // Create element with both uppercase and lowercase keys
        // Normalize value to array if needed (to match standard parser behavior)
        let normalizedValue = value;
        if (
            value !== undefined &&
            !(value instanceof Uint8Array) &&
            !Array.isArray(value)
        ) {
            normalizedValue = [value] as Array<string | number>;
        }

        const elementData: DicomElement = {
            vr,
            VR: vr,
            Value: normalizedValue as
                | Array<string | number>
                | Record<string, unknown>
                | Uint8Array
                | undefined,
            value: normalizedValue as
                | Array<string | number>
                | Record<string, unknown>
                | Uint8Array
                | undefined,
            length: length,
            Length: length,
            items: undefined,
            Items: undefined,
        };

        return {
            dict: { [tagHex]: elementData },
            normalizedElements: { [tagHex]: elementData },
        };
    }

    /**
     * Parse element value
     */
    private parseElementValue(
        view: SafeDataView,
        vr: string,
        length: number
    ):
        | string
        | number
        | Array<string | number>
        | Record<string, unknown>
        | Uint8Array {
        if (
            vr === "OB" ||
            vr === "OW" ||
            vr === "OF" ||
            vr === "OD" ||
            vr === "OL" ||
            vr === "UN"
        ) {
            // Binary data - return as Uint8Array for efficiency
            const bytes = view.readBytes(length);
            return new Uint8Array(bytes);
        }

        if (vr === "AT") {
            const count = length / 4;
            const tags: number[] = [];
            for (let i = 0; i < count; i++) {
                const g = view.readUint16();
                const e = view.readUint16();
                tags.push(g, e);
            }
            return tags;
        }

        const str = view.readString(length, this.state.characterSet);

        if (
            vr === "IS" ||
            vr === "SL" ||
            vr === "SS" ||
            vr === "UL" ||
            vr === "US"
        ) {
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

        if (vr === "DS" || vr === "FL" || vr === "FD") {
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

        // Lazy parsing for PN/DA/TM/DT/AS - return raw string
        if (
            vr === "PN" ||
            vr === "DA" ||
            vr === "TM" ||
            vr === "DT" ||
            vr === "AS"
        ) {
            return str;
        }

        const parts = str.split("\\");
        return parts.length === 1 ? parts[0] : parts;
    }

    /**
     * Read meta information from Part 10 file
     */
    private readMetaInformation(metaView: SafeDataView): {
        transferSyntax?: string;
    } {
        const result: { transferSyntax?: string } = {};

        if (metaView.getRemainingBytes() < 8) {
            return result;
        }

        const metaGroup = metaView.readUint16();
        const metaElement = metaView.readUint16();

        if (metaGroup !== 0x0002 || metaElement !== 0x0000) {
            return result;
        }

        const vrBytes = metaView.readBytes(2);
        const vr = String.fromCharCode(vrBytes[0], vrBytes[1]);
        let length: number;
        if (requiresExplicitLength(vr)) {
            metaView.readUint16();
            length = metaView.readUint32();
        } else {
            length = metaView.readUint16();
        }
        metaView.readBytes(length);

        const maxMetaElements = 20;
        let metaIterations = 0;

        while (
            metaView.getRemainingBytes() >= 8 &&
            metaIterations < maxMetaElements
        ) {
            metaIterations++;
            const tsGroup = metaView.readUint16();
            const tsElement = metaView.readUint16();

            if (tsGroup === 0x0002 && tsElement === 0x0010) {
                const tsVrBytes = metaView.readBytes(2);
                const tsVr = String.fromCharCode(tsVrBytes[0], tsVrBytes[1]);
                let tsLength: number;
                if (requiresExplicitLength(tsVr)) {
                    metaView.readUint16();
                    tsLength = metaView.readUint32();
                } else {
                    tsLength = metaView.readUint16();
                }
                result.transferSyntax = metaView.readString(tsLength).trim();
                break;
            } else if (tsGroup === 0x0002) {
                const tsVrBytes = metaView.readBytes(2);
                const tsVr = String.fromCharCode(tsVrBytes[0], tsVrBytes[1]);
                let tsLength: number;
                if (requiresExplicitLength(tsVr)) {
                    metaView.readUint16();
                    tsLength = metaView.readUint32();
                } else {
                    tsLength = metaView.readUint16();
                }
                metaView.readBytes(tsLength);
            } else {
                metaView.setPosition(metaView.getPosition() - 4);
                break;
            }
        }

        return result;
    }
}

/**
 * Parse DICOM file from ReadableStream
 */
export async function parseFromStream(
    stream: ReadableStream<Uint8Array>,
    options: StreamingOptions = {}
): Promise<void> {
    const parser = new StreamingParser(options);
    const reader = stream.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                parser.finalize();
                break;
            }
            parser.processChunk(value);
        }
    } catch (error) {
        if (options.onError) {
            options.onError(
                error instanceof Error ? error : new Error(String(error))
            );
        }
        throw error;
    } finally {
        reader.releaseLock();
    }
}

/**
 * Parse DICOM file from async iterator
 */
export async function parseFromAsyncIterator(
    iterator: AsyncIterable<Uint8Array>,
    options: StreamingOptions = {}
): Promise<void> {
    const parser = new StreamingParser(options);

    try {
        for await (const chunk of iterator) {
            parser.processChunk(chunk);
        }
        parser.finalize();
    } catch (error) {
        if (options.onError) {
            options.onError(
                error instanceof Error ? error : new Error(String(error))
            );
        }
        throw error;
    }
}
