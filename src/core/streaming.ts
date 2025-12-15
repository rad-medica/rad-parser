/**
 * Streaming Parser: Handles incremental parsing of DICOM files
 *
 * Supports parsing DICOM files in chunks for memory-efficient processing
 * of very large files.
 */

import type { DicomElement } from './types';
import { SafeDataView } from '../utils/SafeDataView';
import { detectVR, detectVRForPrivateTag, requiresExplicitLength } from '../utils/vrDetection';
import { parseValueByVR } from '../utils/valueParsers';
import { parseSequence } from '../utils/sequenceParser';
import { extractPixelDataFromView } from '../utils/pixelData';
import { isPrivateTag } from '../utils/dictionary';

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
  private options: Required<Pick<StreamingOptions, 'maxBufferSize' | 'maxIterations'>> &
    Pick<StreamingOptions, 'onElement' | 'onError'>;

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
      characterSet: 'ISO_IR 192',
      isDicomPart10: false,
      initialized: false,
    };
  }

  /**
   * Initialize parser with first chunk
   */
  initialize(chunk: Uint8Array): void {
    if (this.state.initialized) {
      throw new Error('Parser already initialized');
    }

    // Check for DICM magic string
    if (chunk.length >= 132) {
      const magic = chunk.slice(128, 132);
      const magicString = String.fromCharCode(...magic);
      if (magicString === 'DICM') {
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
          buffer = sourceBuffer.slice(chunk.byteOffset + this.state.offset);
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
        if (this.state.transferSyntax === '1.2.840.10008.1.2') {
          this.state.explicitVR = false;
          this.state.littleEndian = true;
        } else if (this.state.transferSyntax === '1.2.840.10008.1.2.2') {
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
    // Append chunk to buffer immediately
    const newBuffer = new Uint8Array(this.state.buffer.length + chunk.length);
    newBuffer.set(this.state.buffer);
    newBuffer.set(chunk, this.state.buffer.length);
    this.state.buffer = newBuffer;

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
            this.initialize(this.state.buffer);
            this.processElements(true);
        }
        return;
    }

    // Process any remaining elements
    this.processElements(true);

    // Clear buffer
    this.state.buffer = new Uint8Array(0);
  }

  /**
   * Process elements from buffer
   */
  private processElements(final: boolean = false): void {
    // Ensure we have an ArrayBuffer (not SharedArrayBuffer)
    let buffer: ArrayBuffer;
    const sourceBuffer = this.state.buffer.buffer;
    if (sourceBuffer instanceof ArrayBuffer) {
      buffer = sourceBuffer.slice(
        this.state.buffer.byteOffset + this.state.offset,
        this.state.buffer.byteOffset + this.state.buffer.length
      );
    } else {
      // SharedArrayBuffer - copy to new ArrayBuffer
      const length = this.state.buffer.length - this.state.offset;
      buffer = new ArrayBuffer(length);
      const dest = new Uint8Array(buffer);
      const src = this.state.buffer.slice(this.state.offset);
      dest.set(src);
    }

    const view = new SafeDataView(buffer, 0);
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
          break;
        }

        // Emit element
        if (this.options.onElement) {
          this.options.onElement(element);
        }

        // NOTE: We update offset ONLY AFTER the loop or batch.
        // But doing it here (cumulatively) was the bug.
        // We do NOT update this.state.offset here.
      } catch (error) {
        if (this.options.onError) {
          this.options.onError(
            error instanceof Error ? error : new Error(String(error))
          );
        }
        break;
      }
    }
    
    // Update offset by the total amount consumed in this batch
    // view.getPosition() is the total bytes consumed by all parseElement calls in this batch.
    this.state.offset += view.getPosition();
  }

  /**
   * Parse a single element
   */
  private parseElement(
    view: SafeDataView,
    final: boolean
  ): { dict: Record<string, DicomElement>; normalizedElements: Record<string, DicomElement> } | null {
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
    let vr = 'UN';
    let length: number;

    if (this.state.explicitVR) {
      if (view.getRemainingBytes() < 2) {
        // Not enough data - wait for more
        view.setPosition(startPos);
        return null;
      }
      const vrBytes = view.readBytes(2);
      vr = String.fromCharCode(vrBytes[0], vrBytes[1]);

      if (requiresExplicitLength(vr)) {
        if (view.getRemainingBytes() < 6) {
          view.setPosition(startPos);
          return null;
        }
        view.readUint16();
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

      const tagHex = `x${group.toString(16).padStart(4, '0')}${element.toString(16).padStart(4, '0')}`;
      if (isPrivateTag(tagHex)) {
        vr = detectVRForPrivateTag(group, element, length);
      } else {
        vr = detectVR(group, element);
      }
    }

    // Format tag (single format only - tagHex)
    const tagHex = `x${group.toString(16).padStart(4, '0')}${element.toString(16).padStart(4, '0')}`;

    // Handle sequences
    if (vr === 'SQ' || length === 0xffffffff) {
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
          vr: 'SQ',
          VR: 'SQ',
          Value: sequence as unknown as Array<string | number> | Record<string, unknown>,
          value: sequence as unknown as Array<string | number> | Record<string, unknown>,
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
          vr: 'SQ',
          VR: 'SQ',
          Value: sequence as unknown as Array<string | number> | Record<string, unknown>,
          value: sequence as unknown as Array<string | number> | Record<string, unknown>,
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

    // Check if we have enough data for this element
    if (length > 0 && view.getRemainingBytes() < length) {
      if (!final) {
        // Not enough data - wait for more chunks
        view.setPosition(startPos);
        return null;
      }
      // Final chunk - read what we have
      length = view.getRemainingBytes();
    }

    // Handle pixel data
    const isPixelData = group === 0x7fe0 && element === 0x0010;
    let value: string | number | Array<string | number> | Record<string, unknown> | Uint8Array | Array<Uint8Array> | undefined = undefined;

    if (isPixelData) {
      const pixelDataResult = extractPixelDataFromView(view, length, this.state.transferSyntax);
      if (pixelDataResult) {
        // Export pixel data in compatible format:
        // - Uncompressed: Direct Uint8Array
        // - Encapsulated: Array<Uint8Array> (fragments)
        if (pixelDataResult.isEncapsulated && pixelDataResult.fragmentArrays && pixelDataResult.fragmentArrays.length > 0) {
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
    if (value !== undefined && !(value instanceof Uint8Array) && !Array.isArray(value)) {
      normalizedValue = [value] as Array<string | number>;
    }

    const elementData: DicomElement = {
      vr,
      VR: vr,
      Value: normalizedValue as Array<string | number> | Record<string, unknown> | Uint8Array | undefined,
      value: normalizedValue as Array<string | number> | Record<string, unknown> | Uint8Array | undefined,
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
  ): string | number | Array<string | number> | Record<string, unknown> | Uint8Array {
    if (vr === 'OB' || vr === 'OW' || vr === 'OF' || vr === 'OD' || vr === 'OL' || vr === 'UN') {
      // Binary data - return as Uint8Array for efficiency
      const bytes = view.readBytes(length);
      return new Uint8Array(bytes);
    }

    if (vr === 'AT') {
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

    if (vr === 'IS' || vr === 'SL' || vr === 'SS' || vr === 'UL' || vr === 'US') {
      const parts = str.split('\\').filter(p => p.trim());
      if (parts.length === 1) {
        const num = parseFloat(parts[0]);
        return isNaN(num) ? str : Math.floor(num);
      }
      return parts.map(p => {
        const num = parseFloat(p.trim());
        return isNaN(num) ? p.trim() : num;
      });
    }

    if (vr === 'DS' || vr === 'FL' || vr === 'FD') {
      const parts = str.split('\\').filter(p => p.trim());
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
    if (vr === 'PN' || vr === 'DA' || vr === 'TM' || vr === 'DT' || vr === 'AS') {
      return str;
    }

    const parts = str.split('\\');
    return parts.length === 1 ? parts[0] : parts;
  }

  /**
   * Read meta information from Part 10 file
   */
  private readMetaInformation(metaView: SafeDataView): { transferSyntax?: string } {
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

    while (metaView.getRemainingBytes() >= 8 && metaIterations < maxMetaElements) {
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
      options.onError(error instanceof Error ? error : new Error(String(error)));
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
      options.onError(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}
