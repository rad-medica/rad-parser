/**
 * DICOM Writer
 *
 * Zero-dependency DICOM Part 10 serializer (PS3.10 7.1, PS3.5 7).
 * Supports Implicit VR Little Endian, Explicit VR Little Endian, Explicit VR
 * Big Endian, Deflated Explicit VR Little Endian (written with stored deflate
 * blocks) and encapsulated transfer syntaxes (fragments are written as given).
 *
 * Values are expected in the form the parser returns them: binary word VRs
 * (OW, OF, OL, OD, OV) and Pixel Data in Little Endian byte order; they are
 * swapped when writing Big Endian.
 */

import { deflateRawStored } from '../utils/inflate';
import { isLongVR } from './datasetReader';
import type { DicomDataSet, DicomElement } from './types';

const TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2';
const TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';
const TRANSFER_SYNTAX_EXPLICIT_VR_BIG_ENDIAN = '1.2.840.10008.1.2.2';
const DEFLATED_TRANSFER_SYNTAXES = new Set(['1.2.840.10008.1.2.1.99', '1.2.840.10008.1.2.4.95']);

const PREAMBLE_LENGTH = 128;
const IMPLEMENTATION_CLASS_UID = '1.2.826.0.1.3680043.9.7433.1.1';
const IMPLEMENTATION_VERSION_NAME = 'RADPARSER_2_0';
const UNDEFINED_LENGTH = 0xffffffff;

const encoder = new TextEncoder();

/** VRs padded with a trailing space to even length (PS3.5 6.2); others use NUL. */
const SPACE_PADDED_VRS = new Set([
  'AE',
  'AS',
  'CS',
  'DA',
  'DS',
  'DT',
  'IS',
  'LO',
  'LT',
  'PN',
  'SH',
  'ST',
  'TM',
  'UC',
  'UR',
  'UT',
]);

/** Word size of binary VRs, used to byte-swap for Big Endian (PS3.5 7.3). */
const WORD_SIZE: Record<string, number> = { OW: 2, OF: 4, OL: 4, OD: 8, OV: 8 };

export interface WriteOptions {
  /**
   * Transfer Syntax to write. Defaults to Explicit VR Little Endian.
   * Implicit VR LE, Explicit VR LE / BE, Deflated Explicit VR LE and any
   * encapsulated transfer syntax (Pixel Data written as stored) are accepted.
   */
  transferSyntax?: string;
}

interface WriteContext {
  explicitVR: boolean;
  littleEndian: boolean;
}

/**
 * Serialize a DicomDataSet to a Uint8Array (DICOM Part 10 file).
 */
export function write(dataset: DicomDataSet, options: WriteOptions = {}): Uint8Array {
  const transferSyntax = options.transferSyntax || TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN;

  const context: WriteContext = {
    explicitVR: transferSyntax !== TRANSFER_SYNTAX_IMPLICIT_VR_LITTLE_ENDIAN,
    littleEndian: transferSyntax !== TRANSFER_SYNTAX_EXPLICIT_VR_BIG_ENDIAN,
  };

  const dataTags: string[] = [];
  const metaElements: Record<string, DicomElement> = {};
  for (const tag in dataset.dict) {
    const element = dataset.dict[tag];
    if (!element) continue;
    if (tag.toLowerCase().startsWith('x0002')) {
      metaElements[tag.toLowerCase()] = element;
    } else {
      dataTags.push(tag);
    }
  }
  dataTags.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  if (!metaElements['x00020001']) {
    metaElements['x00020001'] = {
      vr: 'OB',
      Value: new Uint8Array([0x00, 0x01]),
    };
  }
  if (!metaElements['x00020002']) {
    const val = dataset.dict['x00080016']?.Value;
    if (val) metaElements['x00020002'] = { vr: 'UI', Value: val };
  }
  if (!metaElements['x00020003']) {
    const val = dataset.dict['x00080018']?.Value;
    if (val) metaElements['x00020003'] = { vr: 'UI', Value: val };
  }
  metaElements['x00020010'] = { vr: 'UI', Value: transferSyntax };
  if (!metaElements['x00020012']) {
    metaElements['x00020012'] = {
      vr: 'UI',
      Value: IMPLEMENTATION_CLASS_UID,
    };
  }
  if (!metaElements['x00020013']) {
    metaElements['x00020013'] = {
      vr: 'SH',
      Value: IMPLEMENTATION_VERSION_NAME,
    };
  }
  delete metaElements['x00020000']; // recomputed below

  // File Meta Information is always Explicit VR Little Endian (PS3.10 7.1)
  const metaContext: WriteContext = { explicitVR: true, littleEndian: true };
  const metaChunks: Uint8Array[] = [];
  for (const tag of Object.keys(metaElements).sort()) {
    const chunk = serializeElement(tag, metaElements[tag]!, metaContext);
    if (chunk) metaChunks.push(chunk);
  }
  const metaLength = metaChunks.reduce((acc, c) => acc + c.length, 0);
  const groupLength = serializeElement('x00020000', { vr: 'UL', Value: metaLength }, metaContext)!;

  const dataChunks: Uint8Array[] = [];
  for (const tag of dataTags) {
    const chunk = serializeElement(tag, dataset.dict[tag]!, context);
    if (chunk) dataChunks.push(chunk);
  }
  let body = concatChunks(dataChunks);
  if (DEFLATED_TRANSFER_SYNTAXES.has(transferSyntax)) {
    body = deflateRawStored(body);
    if (body.length % 2 !== 0) {
      // A single trailing NULL pads an odd deflate stream (PS3.5 A.5)
      body = concatChunks([body, new Uint8Array(1)]);
    }
  }

  return concatChunks([
    new Uint8Array(PREAMBLE_LENGTH),
    encoder.encode('DICM'),
    groupLength,
    ...metaChunks,
    body,
  ]);
}

export function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalLength += chunks[i]!.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function parseTag(tagHex: string): { group: number; elem: number } | null {
  const clean = tagHex.replace(/^x/i, '').replace(/[(),]/g, '');
  if (!/^[0-9a-fA-F]{8}$/.test(clean)) return null;
  return {
    group: parseInt(clean.slice(0, 4), 16),
    elem: parseInt(clean.slice(4, 8), 16),
  };
}

function itemHeader(element: number, length: number, context: WriteContext): Uint8Array {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint16(0, 0xfffe, context.littleEndian);
  view.setUint16(2, element, context.littleEndian);
  view.setUint32(4, length, context.littleEndian);
  return header;
}

/** Copy `bytes`, swapping each `word`-byte group (LE <-> BE). */
function swapWords(bytes: Uint8Array, word: number): Uint8Array {
  if (bytes.length % word !== 0) {
    throw new Error(`Value length must be a multiple of ${word} bytes`);
  }
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += word) {
    for (let b = 0; b < word; b++) out[i + b] = bytes[i + word - 1 - b]!;
  }
  return out;
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.length > 0 && value.every(v => v instanceof Uint8Array)) {
    return concatChunks(value as Uint8Array[]);
  }
  return null;
}

/** Format a DS number within the 16-byte limit (PS3.5 Table 6.2-1). */
function formatDS(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  let s = String(n);
  if (s.length <= 16) return s;
  for (let p = 15; p > 0; p--) {
    s = String(Number(n.toPrecision(p)));
    if (s.length <= 16) return s;
    s = n.toExponential(Math.max(0, p - 6));
    if (s.length <= 16) return s;
  }
  return s.slice(0, 16);
}

function stringValue(vr: string, val: unknown): string {
  if (val === undefined || val === null) return '';
  const one = (v: unknown): string => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return vr === 'DS' ? formatDS(v) : String(v);
    if (typeof v === 'string') return v;
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      // Person Name objects
      const pn = o.Alphabetic ?? o.Alphanumeric;
      if (typeof pn === 'string') return pn;
    }
    return String(v);
  };
  return Array.isArray(val) ? val.map(one).join('\\') : one(val);
}

function numericValue(vr: string, val: unknown, context: WriteContext): Uint8Array | null {
  let nums: Array<number | bigint>;
  if (Array.isArray(val)) nums = val as Array<number | bigint>;
  else if (typeof val === 'number' || typeof val === 'bigint') nums = [val];
  else if (typeof val === 'string') nums = val.split('\\').map(Number);
  else return null;
  const le = context.littleEndian;
  if (vr === 'AT') {
    // Stored as [group, element, group, element, ...]
    const out = new Uint8Array(nums.length * 2);
    const view = new DataView(out.buffer);
    nums.forEach((n, i) => view.setUint16(i * 2, Number(n), le));
    return out;
  }
  const size = vr === 'US' || vr === 'SS' ? 2 : vr === 'FD' || vr === 'SV' || vr === 'UV' ? 8 : 4;
  const out = new Uint8Array(nums.length * size);
  const view = new DataView(out.buffer);
  nums.forEach((n, i) => {
    const off = i * size;
    switch (vr) {
      case 'US':
        view.setUint16(off, Number(n), le);
        break;
      case 'SS':
        view.setInt16(off, Number(n), le);
        break;
      case 'UL':
        view.setUint32(off, Number(n), le);
        break;
      case 'SL':
        view.setInt32(off, Number(n), le);
        break;
      case 'FL':
        view.setFloat32(off, Number(n), le);
        break;
      case 'FD':
        view.setFloat64(off, Number(n), le);
        break;
      case 'SV':
        view.setBigInt64(off, BigInt(n), le);
        break;
      case 'UV':
        view.setBigUint64(off, BigInt(n), le);
        break;
    }
  });
  return out;
}

const NUMERIC_VRS = new Set(['US', 'SS', 'UL', 'SL', 'FL', 'FD', 'SV', 'UV', 'AT']);

/** Encode a sequence (undefined length, items of explicit length). */
function encodeSequence(element: DicomElement, context: WriteContext): Uint8Array {
  const chunks: Uint8Array[] = [];
  const items = (element.items ?? element.Value ?? []) as Array<{
    elements?: Record<string, DicomElement>;
  }>;
  for (const item of Array.isArray(items) ? items : []) {
    const body = serializeDataset(item.elements || {}, context);
    chunks.push(itemHeader(0xe000, body.length, context), body);
  }
  chunks.push(itemHeader(0xe0dd, 0, context));
  return concatChunks(chunks);
}

/** Encode encapsulated Pixel Data: Basic Offset Table item, fragments, delimiter (PS3.5 A.4). */
function encodeEncapsulated(element: DicomElement, context: WriteContext): Uint8Array {
  const chunks: Uint8Array[] = [];
  const bot = element.basicOffsetTable ?? [];
  const botBytes = new Uint8Array(bot.length * 4);
  const botView = new DataView(botBytes.buffer);
  bot.forEach((v, i) => botView.setUint32(i * 4, v, context.littleEndian));
  chunks.push(itemHeader(0xe000, botBytes.length, context), botBytes);
  const fragments = Array.isArray(element.Value) ? (element.Value as Uint8Array[]) : [];
  for (const frag of fragments) {
    chunks.push(itemHeader(0xe000, frag.length, context), frag);
  }
  chunks.push(itemHeader(0xe0dd, 0, context));
  return concatChunks(chunks);
}

export function serializeElement(
  tagHex: string,
  element: DicomElement,
  context: WriteContext
): Uint8Array | null {
  const tagParts = parseTag(tagHex);
  if (!tagParts) return null;
  const { group, elem } = tagParts;

  let vr = (element.vr || element.VR || 'UN').toUpperCase();
  let undefinedLength = false;
  let valueBytes: Uint8Array;

  if (vr === 'SQ' || Array.isArray(element.items)) {
    vr = 'SQ';
    valueBytes = encodeSequence(element, context);
    undefinedLength = true;
  } else if (element.isEncapsulated) {
    valueBytes = encodeEncapsulated(element, context);
    undefinedLength = true;
    if (vr !== 'OB' && vr !== 'OW') vr = 'OB';
  } else if (NUMERIC_VRS.has(vr) && !(element.Value instanceof Uint8Array)) {
    valueBytes = numericValue(vr, element.Value, context) ?? new Uint8Array(0);
  } else {
    const raw = toBytes(element.Value);
    if (raw) {
      const word = WORD_SIZE[vr];
      valueBytes = !context.littleEndian && word ? swapWords(raw, word) : raw;
    } else {
      valueBytes = encoder.encode(stringValue(vr, element.Value));
    }
    if (valueBytes.length % 2 !== 0) {
      const padded = new Uint8Array(valueBytes.length + 1);
      padded.set(valueBytes);
      padded[valueBytes.length] = SPACE_PADDED_VRS.has(vr) ? 0x20 : 0x00;
      valueBytes = padded;
    }
  }

  // A value too long for a 16-bit length field is written as UN (PS3.5 6.2.2)
  if (context.explicitVR && !isLongVR(vr) && valueBytes.length > 0xfffe) {
    vr = 'UN';
  }

  const valueLen = valueBytes.length;
  const lengthField = undefinedLength ? UNDEFINED_LENGTH : valueLen;
  const le = context.littleEndian;

  if (context.explicitVR) {
    const long = isLongVR(vr);
    const headerLen = long ? 12 : 8;
    const buffer = new Uint8Array(headerLen + valueLen);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, group, le);
    view.setUint16(2, elem, le);
    buffer[4] = vr.charCodeAt(0);
    buffer[5] = vr.charCodeAt(1);
    if (long) {
      view.setUint16(6, 0, le);
      view.setUint32(8, lengthField, le);
    } else {
      view.setUint16(6, valueLen, le);
    }
    buffer.set(valueBytes, headerLen);
    return buffer;
  }

  const buffer = new Uint8Array(8 + valueLen);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, group, le);
  view.setUint16(2, elem, le);
  view.setUint32(4, lengthField, le);
  buffer.set(valueBytes, 8);
  return buffer;
}

function serializeDataset(dict: Record<string, DicomElement>, context: WriteContext): Uint8Array {
  const sortedTags = Object.keys(dict)
    .filter(tag => /^x/i.test(tag))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const chunks: Uint8Array[] = [];
  for (const tag of sortedTags) {
    const chunk = serializeElement(tag, dict[tag]!, context);
    if (chunk) chunks.push(chunk);
  }
  return concatChunks(chunks);
}
