/**
 * RAD-Parser: DICOM Part 10 / raw Data Set parser.
 *
 * Every mode (full, light, shallow, fast, lazy) uses the structural reader in
 * ./datasetReader.ts, so they agree on what each element is and where it is.
 *
 * Byte order: values are returned in host order. For Explicit VR Big Endian,
 * numeric VRs are decoded with Big Endian and binary word VRs (OW, OF, OL, OD,
 * OV), Pixel Data included, are returned byte-swapped to Little Endian (a copy).
 * OB / UN values are byte streams and are never swapped.
 */

import { inflateRaw } from '../utils/inflate';
import { formatTagWithComma, normalizeTag } from '../utils/tagUtils';
import {
  readDataSet,
  toShallow,
  decodeValue,
  type PixelDataMode,
  type ReaderContext,
} from './datasetReader';
import { createParseError, DicomParseError } from './errors';
import { registry } from './registry';
import type { DicomDataSet, DicomElement, PixelDataInfo, ShallowDicomDataSet } from './types';

export type { PixelDataMode } from './datasetReader';

/**
 * Transfer syntax constants (PS3.5 Section 10 / Annex A)
 */
const TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2';
const TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';
const TRANSFER_SYNTAX_EXPLICIT_VR_BIG_ENDIAN = '1.2.840.10008.1.2.2';
/** Data Set is a raw deflate stream (PS3.5 A.5). */
const DEFLATED_TRANSFER_SYNTAXES = new Set([
  '1.2.840.10008.1.2.1.99', // Deflated Explicit VR Little Endian
  '1.2.840.10008.1.2.4.95', // JPIP Referenced Deflate
]);

/**
 * Parse result with metadata
 */
export interface ParseResult {
  dataset: DicomDataSet;
  transferSyntax: string;
  characterSet: string;
}

/** Input prepared for reading: byte order, VR encoding and where data starts. */
interface Prepared {
  ctx: ReaderContext;
  dataStart: number;
  transferSyntax: string;
  meta: Record<string, DicomElement>;
}

function toUint8(byteArray: Uint8Array): Uint8Array {
  // Accept Node Buffers and views on SharedArrayBuffer without copying
  return byteArray instanceof Uint8Array
    ? byteArray
    : new Uint8Array(byteArray as ArrayLike<number>);
}

function makeContext(
  bytes: Uint8Array,
  explicitVR: boolean,
  littleEndian: boolean,
  pixelData: PixelDataMode
): ReaderContext {
  return {
    bytes,
    dv: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    explicitVR,
    littleEndian,
    characterSet: 'ISO_IR 6', // Default repertoire (PS3.5 6.1.2.1)
    pixelData,
  };
}

function isUpper(c: number | undefined): boolean {
  return c !== undefined && c >= 0x41 && c <= 0x5a;
}

function cleanUID(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s.replace(/[\0 ]+$/g, '').trim() : undefined;
}

/**
 * Detect Part 10 header, read File Meta Information and set up the reader for
 * the Data Set (inflating it for deflated transfer syntaxes).
 */
function prepare(byteArray: Uint8Array, pixelData: PixelDataMode): Prepared {
  let bytes = toUint8(byteArray);
  if (bytes.length < 8) {
    throw createParseError('File too small to be a valid DICOM file', undefined, 0);
  }

  const isPart10 =
    bytes.length >= 132 &&
    bytes[128] === 0x44 && // D
    bytes[129] === 0x49 && // I
    bytes[130] === 0x43 && // C
    bytes[131] === 0x4d; // M

  let meta: Record<string, DicomElement> = {};
  let dataStart = 0;
  let transferSyntax: string;

  if (isPart10) {
    // File Meta Information: always Explicit VR Little Endian (PS3.10 7.1)
    const metaCtx = makeContext(bytes, true, true, 'view');
    const r = readDataSet(metaCtx, 132, bytes.length, 0, {
      onlyGroup: 0x0002,
    });
    meta = r.dict;
    dataStart = r.pos;
    transferSyntax =
      cleanUID(meta['x00020010']?.Value) || TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN;
  } else {
    // Raw Data Set without preamble: infer the encoding from the first element
    const group = bytes[0]! | (bytes[1]! << 8);
    if (group === 0x0000) {
      throw createParseError('Format detection failed - Invalid DICOM file format', undefined, 0);
    }
    transferSyntax =
      isUpper(bytes[4]) && isUpper(bytes[5])
        ? TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN
        : TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN;
  }

  let explicitVR = true;
  let littleEndian = true;
  if (transferSyntax === TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN) {
    explicitVR = false;
  } else if (transferSyntax === TRANSFER_SYNTAX_EXPLICIT_VR_BIG_ENDIAN) {
    littleEndian = false;
  } else if (DEFLATED_TRANSFER_SYNTAXES.has(transferSyntax)) {
    let inflated: Uint8Array;
    try {
      inflated = inflateRaw(bytes.subarray(dataStart), (bytes.length - dataStart) * 4);
    } catch (error) {
      throw createParseError(
        `Deflated Data Set could not be inflated - ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        dataStart,
        error instanceof Error ? error : undefined
      );
    }
    // Same layout as the file: original header, then the inflated Data Set
    const full = new Uint8Array(dataStart + inflated.length);
    full.set(bytes.subarray(0, dataStart), 0);
    full.set(inflated, dataStart);
    bytes = full;
    // Meta values were views on the input; they stay valid (input is kept)
  }

  return {
    ctx: makeContext(bytes, explicitVR, littleEndian, pixelData),
    dataStart,
    transferSyntax,
    meta,
  };
}

/**
 * Inflate a Deflated Explicit VR Little Endian file (PS3.5 A.5) into the
 * layout every offset reported by the parser refers to: the original header
 * (preamble + File Meta Information) followed by the inflated Data Set. Other
 * inputs are returned unchanged.
 */
export function inflateDicom(byteArray: Uint8Array): Uint8Array {
  return prepare(byteArray, 'skip').ctx.bytes;
}

/**
 * Extract transfer syntax from DICOM file without full parsing
 *
 * @param byteArray - The DICOM file as a Uint8Array
 * @returns Transfer syntax UID or undefined if not found
 */
export function extractTransferSyntax(byteArray: Uint8Array): string | undefined {
  try {
    const bytes = toUint8(byteArray);
    if (bytes.length < 132) return undefined;
    const metaCtx = makeContext(bytes, true, true, 'skip');
    const r = readDataSet(metaCtx, 132, bytes.length, 0, {
      onlyGroup: 0x0002,
    });
    return cleanUID(r.dict['x00020010']?.Value);
  } catch {
    return undefined;
  }
}

/**
 * Check if byte array appears to be a valid DICOM file
 *
 * @param byteArray - The file data as a Uint8Array
 * @returns True if file appears to be valid DICOM
 */
export function canParse(byteArray: Uint8Array): boolean {
  try {
    if (byteArray.length < 8) {
      return false;
    }
    if (
      byteArray.length >= 132 &&
      byteArray[128] === 0x44 &&
      byteArray[129] === 0x49 &&
      byteArray[130] === 0x43 &&
      byteArray[131] === 0x4d
    ) {
      return true;
    }
    const group = byteArray[0]! | (byteArray[1]! << 8);
    const groupBE = (byteArray[0]! << 8) | byteArray[1]!;
    return group !== 0x0000 || groupBE !== 0x0000;
  } catch {
    return false;
  }
}

export interface ParseOptions {
  /** Do not materialise Pixel Data (locations are still reported). */
  skipPixelData?: boolean;
  /**
   * How Pixel Data values are materialised:
   * - "view" (default): zero-copy subarrays of the input
   * - "copy": independent copies
   * - "skip": no value; `dataOffset`, `fragments` and `basicOffsetTable`
   *   are still set so frames can be read later from the input bytes
   * Big Endian native Pixel Data in OW is always returned as a swapped copy.
   */
  pixelData?: PixelDataMode;
  /**
   * Optional tags to filter (include only these).
   * Note: This filters at the root level.
   */
  filterTags?: string[];
  /**
   * Custom plugin to decode pixel data.
   * If provided, this function is called when Pixel Data (7FE0,0010) is encountered.
   */
  pixelDataPlugin?: (element: DicomElement, transferSyntax: string) => unknown;
  /**
   * Kept for API compatibility. Values are decoded in JavaScript; the WASM
   * helpers remain available from ./wasm-opt.
   */
  enableWasm?: boolean;
}

function pixelModeOf(options: ParseOptions): PixelDataMode {
  if (options.skipPixelData) return 'skip';
  return options.pixelData ?? 'view';
}

/**
 * Parse DICOM file with metadata
 *
 * @param byteArray - The DICOM file as a Uint8Array
 * @param options - Parse options
 * @returns Parse result with dataset and metadata
 */
export function parseWithMetadata(byteArray: Uint8Array, options: ParseOptions = {}): ParseResult {
  let prepared: Prepared;
  try {
    prepared = prepare(byteArray, pixelModeOf(options));
  } catch (error) {
    if (error instanceof DicomParseError) throw error;
    throw createParseError(
      `Format detection failed - ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      0,
      error instanceof Error ? error : undefined
    );
  }
  const { ctx, dataStart, transferSyntax, meta } = prepared;

  const filter = options.filterTags
    ? new Set(options.filterTags.map(t => normalizeTag(t)))
    : undefined;

  const dict: Record<string, DicomElement> = meta;
  try {
    readDataSet(ctx, dataStart, ctx.bytes.length, 0, {
      filter,
      into: dict,
    });
  } catch (error) {
    if (error instanceof DicomParseError) throw error;
    throw createParseError(
      `Data element parsing failed - ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      dataStart,
      error instanceof Error ? error : undefined
    );
  }

  const pixel = dict['x7fe00010'];
  if (pixel && options.pixelDataPlugin && ctx.pixelData !== 'skip') {
    try {
      const decoded = options.pixelDataPlugin(pixel, transferSyntax);
      if (decoded !== undefined) {
        pixel.Value = pixel.value = decoded as DicomElement['Value'];
      }
    } catch {
      // Leave the original (encoded) value in place
    }
  }

  const dataset = createDataSet(dict);
  Object.defineProperty(dataset, 'byteArray', {
    value: ctx.bytes,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  return {
    dataset,
    transferSyntax,
    characterSet: ctx.characterSet,
  };
}

/**
 * Unified Parser Options
 */
export interface UnifiedParseOptions {
  /**
   * Parsing strategy:
   * - 'fast': Locations only (same as 'shallow', plus a `tag` field).
   * - 'shallow': Locations only (vr, length, dataOffset; fragments for Pixel Data).
   * - 'full': Decodes all values.
   * - 'light': Full parse without Pixel Data values (locations kept).
   * - 'lazy': Returns object that reads values from buffer on demand.
   */
  type?: 'fast' | 'shallow' | 'full' | 'light' | 'lazy';

  /**
   * Tags to include in the result.
   * Can be a single tag string or array of tag strings.
   * Formats: 'x00100010', '0010,0010', or '00100010'.
   */
  tags?: string | string[];

  /** Pixel Data materialisation for 'full' (see ParseOptions.pixelData). */
  pixelData?: PixelDataMode;

  /** Kept for API compatibility (see ParseOptions.enableWasm). */
  enableWasm?: boolean;

  /**
   * Custom plugin to decode pixel data.
   */
  pixelDataPlugin?: (element: DicomElement, transferSyntax: string) => unknown;
}

/**
 * Main Unified Parse Function
 *
 * @param byteArray - The DICOM file data
 * @param options - Configuration options
 */
export function parse(
  byteArray: Uint8Array,
  options: UnifiedParseOptions = {}
): DicomDataSet | ShallowDicomDataSet {
  const mode = options.type || 'full';
  const filterTags = options.tags
    ? Array.isArray(options.tags)
      ? options.tags
      : [options.tags]
    : undefined;

  switch (mode) {
    case 'fast':
      return locationParse(byteArray, filterTags, true);
    case 'shallow':
      return locationParse(byteArray, filterTags, false);
    case 'full':
    case 'light': {
      const res = parseWithMetadata(byteArray, {
        skipPixelData: mode === 'light',
        pixelData: options.pixelData,
        filterTags,
        pixelDataPlugin: options.pixelDataPlugin,
      });
      res.dataset.transferSyntax = res.transferSyntax;
      res.dataset.characterSet = res.characterSet;
      return res.dataset;
    }
    case 'lazy':
      return createLazyDataSet(byteArray, filterTags);
    default:
      throw new Error(`Unknown parse type: ${mode as string}`);
  }
}

/**
 * Shallow parse: element locations only. Offsets refer to the input bytes, or
 * for deflated files to `inflateDicom(input)`.
 */
function locationParse(
  byteArray: Uint8Array,
  filterTags: string[] | undefined,
  withTag: boolean
): ShallowDicomDataSet {
  const result: ShallowDicomDataSet = {};
  let prepared: Prepared;
  try {
    prepared = prepare(byteArray, 'skip');
  } catch {
    return result;
  }
  const { ctx, dataStart, meta } = prepared;
  const filter = filterTags ? new Set(filterTags.map(t => normalizeTag(t))) : undefined;
  for (const tag in meta) {
    if (filter && !filter.has(tag)) continue;
    result[tag] = Object.assign(toShallow(meta[tag]!), meta[tag]);
  }
  const dict = result as unknown as Record<string, DicomElement>;
  readDataSet(ctx, dataStart, ctx.bytes.length, 0, {
    filter,
    shallow: true,
    into: dict,
  });
  for (const tag in dict) {
    const el = dict[tag]!;
    // Defined-length elements are already in the shallow shape
    if (el.Value !== undefined || el.fragments || el.items) {
      if (!(tag in meta)) result[tag] = toShallow(el);
    }
    if (withTag) result[tag]!.tag = tag;
  }
  return result;
}

function createLazyDataSet(byteArray: Uint8Array, filterTags?: string[]): DicomDataSet {
  const prepared = prepare(byteArray, 'view');
  const { ctx, dataStart, meta } = prepared;
  const validTags = filterTags ? new Set(filterTags.map(t => normalizeTag(t))) : null;
  // Structure (locations) is read once; values are decoded on access
  const shallow = readDataSet(ctx, dataStart, ctx.bytes.length, 0, {
    filter: validTags ?? undefined,
    shallow: true,
  }).dict;
  Object.assign(shallow, meta);
  let full: Record<string, DicomElement> | null = null;
  const cache = new Map<string, DicomElement>();

  const getElement = (tag: string): DicomElement | undefined => {
    const key = normalizeTag(tag);
    if (validTags && !validTags.has(key)) return undefined;
    const loc = shallow[key];
    if (!loc) return undefined;
    const cached = cache.get(key);
    if (cached) return cached;
    let el: DicomElement;
    if (loc.Value !== undefined || loc.length === 0) {
      el = loc;
    } else if (
      loc.vr === 'SQ' ||
      loc.isEncapsulated ||
      loc.dataOffset === undefined ||
      loc.length === undefined
    ) {
      if (!full) {
        full = readDataSet(ctx, dataStart, ctx.bytes.length, 0, {
          filter: validTags ?? undefined,
        }).dict;
      }
      el = full[key] ?? loc;
    } else {
      const v = decodeValue(ctx, loc.vr ?? 'UN', loc.dataOffset, loc.length, ctx.littleEndian);
      el = { ...loc, Value: v, value: v };
    }
    cache.set(key, el);
    return el;
  };

  const dictProxy = new Proxy({} as Record<string, DicomElement>, {
    get: (_target, prop) => (typeof prop === 'string' ? getElement(prop) : undefined),
    has: (_target, prop) =>
      typeof prop === 'string' &&
      !!shallow[normalizeTag(prop)] &&
      (!validTags || validTags.has(normalizeTag(prop))),
    ownKeys: () => Object.keys(shallow),
    getOwnPropertyDescriptor: (_target, prop) =>
      typeof prop === 'string' && shallow[prop]
        ? { enumerable: true, configurable: true }
        : undefined,
  });

  const dataset = createDataSet(dictProxy);
  dataset.transferSyntax = prepared.transferSyntax;
  return dataset;
}

/**
 * Extract pixel data from DICOM file
 *
 * @param byteArray - The DICOM file as a Uint8Array
 * @returns PixelDataInfo or null if not found
 */
export function extractPixelData(byteArray: Uint8Array): PixelDataInfo | null {
  let prepared: Prepared;
  try {
    prepared = prepare(byteArray, 'view');
  } catch {
    return null;
  }
  const { ctx, dataStart, transferSyntax } = prepared;
  const r = readDataSet(ctx, dataStart, ctx.bytes.length, 0, {
    filter: new Set(['x7fe00010']),
  });
  const el = r.dict['x7fe00010'];
  if (!el) return null;
  if (el.isEncapsulated) {
    const fragments = (el.Value as Uint8Array[] | undefined) ?? [];
    let total = 0;
    for (const f of fragments) total += f.length;
    const pixelData = new Uint8Array(total);
    let o = 0;
    for (const f of fragments) {
      pixelData.set(f, o);
      o += f.length;
    }
    return { pixelData, transferSyntax, isEncapsulated: true, fragments };
  }
  if (!(el.Value instanceof Uint8Array)) return null;
  return {
    pixelData: el.Value,
    transferSyntax,
    isEncapsulated: false,
  };
}

/**
 * Create dataset with accessor methods
 */

function createDataSet(dict: Record<string, DicomElement>): DicomDataSet {
  const getElement = (tag: string): DicomElement | undefined => {
    // Try direct lookup first (most common case)
    const normalized = normalizeTag(tag);
    if (dict[normalized]) return dict[normalized];

    // Fallback: try other tag format variations for compatibility
    const comma = formatTagWithComma(tag);
    const plain = tag.replace(/^x/i, '').replace(/,/g, '');
    return dict[tag] || dict[comma] || dict[plain];
  };

  const dataset = {
    string: (tag: string): string | undefined => {
      const elem = getElement(tag);
      if (!elem) return undefined;
      const val = elem.Value ?? elem.value;

      // Handle already-parsed TypedArrays from Wasm
      if (
        (val instanceof Float64Array || val instanceof Int32Array || val instanceof Float32Array) &&
        val.length > 0
      ) {
        return String(val[0]);
      }

      // Handle string values (may need lazy parsing)
      if (typeof val === 'string') {
        // Check if needs special parsing based on VR
        const vr = elem.vr || elem.VR;
        if (vr === 'PN') {
          // Person Name: the whole value (all component groups)
          return val;
        }
        // Multi-value strings: split and return first value
        if (val.includes('\\')) {
          return val.split('\\')[0];
        }
        return val;
      }

      // Handle arrays
      if (Array.isArray(val) && val.length > 0) {
        if (typeof val[0] === 'string') return val[0];
        if (typeof val[0] === 'number') return String(val[0]);
      }

      // Handle already-parsed PN objects
      if (typeof val === 'object' && val !== null && 'Alphanumeric' in val) {
        return (val as { Alphanumeric?: string }).Alphanumeric;
      }

      // Handle numbers
      if (typeof val === 'number') return String(val);

      return undefined;
    },
    uint16: (tag: string) => {
      const elem = getElement(tag);
      if (!elem) return undefined;
      const val = elem.Value ?? elem.value;
      if (typeof val === 'number') return Math.floor(val) & 0xffff;
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
        return Math.floor(val[0]) & 0xffff;
      }
      if (typeof val === 'string') {
        const num = parseInt(val, 10);
        return isNaN(num) ? undefined : num & 0xffff;
      }
      if (
        (val instanceof Float64Array || val instanceof Int32Array || val instanceof Float32Array) &&
        val.length > 0
      ) {
        return Math.floor(val[0]!) & 0xffff;
      }
      return undefined;
    },
    int16: (tag: string) => {
      const elem = getElement(tag);
      if (!elem) return undefined;
      const val = elem.Value ?? elem.value;
      if (typeof val === 'number') {
        const num = Math.floor(val);
        return num >= -32768 && num <= 32767 ? num : undefined;
      }
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
        const num = Math.floor(val[0]);
        return num >= -32768 && num <= 32767 ? num : undefined;
      }
      if (typeof val === 'string') {
        const num = parseInt(val, 10);
        return isNaN(num) || num < -32768 || num > 32767 ? undefined : num;
      }
      if (
        (val instanceof Float64Array || val instanceof Int32Array || val instanceof Float32Array) &&
        val.length > 0
      ) {
        const num = Math.floor(val[0]!);
        return num >= -32768 && num <= 32767 ? num : undefined;
      }
      return undefined;
    },
    floatString: (tag: string) => {
      const elem = getElement(tag);
      if (!elem) return undefined;
      const val = elem.Value ?? elem.value;
      if (typeof val === 'number') return val;
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
        return val[0];
      }
      if (typeof val === 'string') {
        const num = parseFloat(val);
        return isNaN(num) ? undefined : num;
      }
      if (
        (val instanceof Float64Array || val instanceof Int32Array || val instanceof Float32Array) &&
        val.length > 0
      ) {
        return val[0];
      }
      return undefined;
    },
    intString: (tag: string) => {
      const elem = getElement(tag);
      if (!elem) return undefined;
      const val = elem.Value ?? elem.value;
      if (typeof val === 'number') return Math.floor(val);
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
        return Math.floor(val[0]);
      }
      if (typeof val === 'string') {
        const num = parseInt(val, 10);
        return isNaN(num) ? undefined : Math.floor(num);
      }
      if (
        (val instanceof Float64Array || val instanceof Int32Array || val instanceof Float32Array) &&
        val.length > 0
      ) {
        return Math.floor(val[0]!);
      }
      return undefined;
    },
    dict: dict,
    elements: dict,
  };

  // Make 'elements' non-enumerable to prevent duplication in JSON output
  Object.defineProperty(dataset, 'elements', {
    value: dict,
    enumerable: false, // Hidden from JSON.stringify
    writable: true,
    configurable: true,
  });

  return dataset;
}

/**
 * A convenience function that parses a DICOM file and automatically
 * decodes the pixel data if a compatible codec is registered.
 * @param byteArray - The DICOM file data.
 * @param options - Unified parse options.
 * @returns A promise that resolves to the DicomDataSet with decoded pixel data.
 */
export async function parseAndDecode(
  byteArray: Uint8Array,
  options: UnifiedParseOptions = {}
): Promise<DicomDataSet> {
  // Ensure we parse with pixel data
  const opts = { ...options, type: 'full' as const };
  const dataset = parse(byteArray, opts) as DicomDataSet;

  const pixelDataElement = dataset.elements['x7fe00010'];
  const transferSyntax = dataset.transferSyntax || dataset.string('x00020010');

  // Check if pixel data is present and compressed (i.e., fragments)
  if (pixelDataElement && Array.isArray(pixelDataElement.Value) && transferSyntax) {
    const decoder = await registry.getDecoder(transferSyntax);

    if (decoder) {
      const fragments = pixelDataElement.Value as Uint8Array[];
      const decodeOptions = {
        transferSyntax,
        samplesPerPixel: dataset.uint16('x00280002') || 1,
        bitsAllocated: dataset.uint16('x00280100') || 8,
      };

      const decodedPixels = await decoder.decode(fragments, decodeOptions);

      // Replace the pixel data value with the decoded buffer
      pixelDataElement.Value = decodedPixels;
      pixelDataElement.vr = 'OW'; // Uncompressed is typically OW
    }
  }

  return dataset;
}
