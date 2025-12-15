/**
 * DICOM Writer
 *
 * simple zero-dependency DICOM serializer.
 * Supports Explicit VR Little Endian (Part 10).
 */

import { DicomDataSet, DicomElement } from './types';

export interface WriteOptions {
  /**
   * Transfer Syntax to write.
   * Currently only supports Explicit VR Little Endian (1.2.840.10008.1.2.1).
   */
  transferSyntax?: string;
  /**
   * Character Set (default: ISO_IR 192 / UTF-8)
   */
  characterSet?: string;
}

const PREAMBLE_LENGTH = 128;
const TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';
const IMPLEMENTATION_CLASS_UID = '1.2.826.0.1.3680043.9.7433.1.1'; // Example generic UID or project specific
const IMPLEMENTATION_VERSION_NAME = 'RADPARSER_2_0';

/**
 * VRs that use 32-bit length (Explicit VR)
 */
const LONG_VRS = new Set(['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UR', 'UT', 'UN']);

/**
 * VRs that use space padding (0x20)
 */
const SPACE_PADDED_VRS = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UR', 'UT']);

// TextEncoder
const encoder = new TextEncoder();

/**
 * Serialize a DicomDataSet to a Uint8Array (DICOM Part 10 file).
 *
 * @param dataset - The dataset to serialize
 * @param options - serialization options
 * @returns Uint8Array containing the DICOM file
 */
export function write(dataset: DicomDataSet, options: WriteOptions = {}): Uint8Array {
  // Pre-allocate chunks array with estimated size (reduces reallocations)
  const chunks: Uint8Array[] = [];
  chunks.length = 0; // Start empty but will grow efficiently

  // 1. Preamble (128 bytes 0x00) - reuse static array
  const preamble = new Uint8Array(PREAMBLE_LENGTH);
  chunks.push(preamble);

  // 2. DICM Prefix - cache encoded value
  const dicmPrefix = encoder.encode('DICM');
  chunks.push(dicmPrefix);

  // 3. Optimized: Single pass to separate meta and data elements
  const dataTags: string[] = [];
  const metaElements: Record<string, DicomElement> = {};
  
  // Single iteration - collect tags only (don't copy elements)
  for (const tag in dataset.dict) {
    if (tag.startsWith('x0002')) {
      metaElements[tag] = dataset.dict[tag];
    } else {
      dataTags.push(tag);
    }
  }
  
  // Sort tags once
  dataTags.sort();
  
  const dataChunks: Uint8Array[] = [];
  // Pre-size array estimate (reduces reallocations)
  const estimatedChunks = Math.min(dataTags.length, 1000);
  dataChunks.length = 0;
  
  // Process data elements
  for (let i = 0; i < dataTags.length; i++) {
     const tag = dataTags[i];
     const chunk = serializeElement(tag, dataset.dict[tag]);
     if (chunk) {
        dataChunks.push(chunk);
     }
  }
  
  // 4. File Meta Information (Group 0002)
  
  // Enforce mandatory Meta Elements
  // 0002,0001 File Meta Information Version
  if (!metaElements['x00020001']) {
      metaElements['x00020001'] = { vr: 'OB', Value: new Uint8Array([0x00, 0x01]) };
  }
  // 0002,0002 Media Storage SOP Class UID (use 0008,0016)
  if (!metaElements['x00020002']) {
     const sopClass = dataset.dict['x00080016']?.Value;
     if (sopClass) metaElements['x00020002'] = { vr: 'UI', Value: sopClass };
  }
  // 0002,0003 Media Storage SOP Instance UID (use 0008,0018)
  if (!metaElements['x00020003']) {
     const sopInstance = dataset.dict['x00080018']?.Value;
     if (sopInstance) metaElements['x00020003'] = { vr: 'UI', Value: sopInstance };
  }
  // 0002,0010 Transfer Syntax UID
  metaElements['x00020010'] = { vr: 'UI', Value: options.transferSyntax || TRANSFER_SYNTAX_EXPLICIT_VR_LITTLE_ENDIAN };
  
  // 0002,0012 Implementation Class UID
  if (!metaElements['x00020012']) {
      metaElements['x00020012'] = { vr: 'UI', Value: IMPLEMENTATION_CLASS_UID };
  }
  // 0002,0013 Implementation Version Name
    if (!metaElements['x00020013']) {
      metaElements['x00020013'] = { vr: 'SH', Value: IMPLEMENTATION_VERSION_NAME };
  }

  // Sort Meta Tags
  const sortedMetaTags = Object.keys(metaElements).sort();
  const metaChunks: Uint8Array[] = [];
  
  for (const tag of sortedMetaTags) {
     const element = metaElements[tag];
     // Meta header is ALWAYS Explicit VR Little Endian
     // So we can use the same serializeElement
     const chunk = serializeElement(tag, element);
     if (chunk) metaChunks.push(chunk);
  }
  
  // Calculate File Meta Information Group Length (0002,0000)
  const metaLength = metaChunks.reduce((acc, c) => acc + c.length, 0);
  const groupLengthElement: DicomElement = { vr: 'UL', Value: metaLength };
  const groupLengthChunk = serializeElement('x00020000', groupLengthElement);
  
  // Add 0002,0000 at the start of meta info
  if (groupLengthChunk) {
    chunks.push(groupLengthChunk);
  }
  chunks.push(...metaChunks); // Then rest of meta
  chunks.push(...dataChunks); // Then body

  return concatChunks(chunks);
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  // Optimized: Single pass calculation and copy
  let totalLength = 0;
  const chunkCount = chunks.length;
  
  // First pass: calculate total length (faster than reduce for large arrays)
  for (let i = 0; i < chunkCount; i++) {
    totalLength += chunks[i].length;
  }
  
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  // Second pass: copy data (using for loop is faster than for-of)
  for (let i = 0; i < chunkCount; i++) {
    const chunk = chunks[i];
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

function serializeDataset(dict: Record<string, DicomElement>): Uint8Array {
  const sortedTags = Object.keys(dict)
    .filter(tag => tag.startsWith('x'))
    .sort();

  const chunks: Uint8Array[] = [];
  for (const tag of sortedTags) {
     const element = dict[tag];
     const chunk = serializeElement(tag, element);
     if (chunk) {
        chunks.push(chunk);
     }
  }
  return concatChunks(chunks);
}

// Optimized tag parsing - inline for better performance (cache adds overhead for small datasets)
function parseTagFast(tagHex: string): { group: number; elem: number } | null {
  if (tagHex.length !== 9 || !tagHex.startsWith('x')) return null;
  
  // Direct parsing - faster than caching for typical use cases
  // Use charCodeAt for hex digits (faster than parseInt for single chars)
  let group = 0;
  let elem = 0;
  
  // Parse group (positions 1-4)
  for (let i = 1; i < 5; i++) {
    const c = tagHex.charCodeAt(i);
    group = (group << 4) | (c > 57 ? c - 87 : c - 48); // 'a'-'f' -> 10-15, '0'-'9' -> 0-9
  }
  
  // Parse element (positions 5-8)
  for (let i = 5; i < 9; i++) {
    const c = tagHex.charCodeAt(i);
    elem = (elem << 4) | (c > 57 ? c - 87 : c - 48);
  }
  
  return { group, elem };
}

function serializeElement(tagHex: string, element: DicomElement): Uint8Array | null {
   // Parse tag xGGGGEEEE (optimized with caching)
   const tagParts = parseTagFast(tagHex);
   if (!tagParts) return null;
   const { group, elem } = tagParts;
   
   // Cache VR uppercase conversion
   const vr = (element.vr || 'UN').toUpperCase();
   let valueBytes: Uint8Array | null = null;
   const isLongVR = LONG_VRS.has(vr);

   // Handle Sequences (SQ)
   if (vr === 'SQ' || (element.items && Array.isArray(element.items))) {
       // We'll use Undefined Length for SQ + Undefined Length for Items (or Explicit for Items if possible)
       // Standard practice: SQ (Undefined Length) -> Item (Undefined Length) -> Elements -> Item Delim -> Item ... -> Seq Delim
       // Simpler for Writer: SQ (Undefined Length) -> Item (Explicit Length) -> Elements -> (No Item Delim needed if explicit) -> Seq Delim
       
       // Let's use SQ with Undefined Length (0xFFFFFFFF)
       // And Items with Explicit Length if we can calculate it easily, otherwise Undefined.
       // Recursive calling requires explicit handling.
       
       const itemChunks: Uint8Array[] = [];
       const items = (element.items || []) as any[];
       for (const item of items) {
           // Item Tag (FFFE, E000)
           // Each item has 'elements' (or 'dict' depending on structure)
           // Parser produces SequenceItem { elements: ... }
           const itemElementsIn = item.elements || {}; 
           const itemBody = serializeDataset(itemElementsIn); // Recursive
           
           // Item Header: FFFE, E000, Length (4 bytes)
           const itemHeader = new Uint8Array(8);
           const itemView = new DataView(itemHeader.buffer);
           itemView.setUint16(0, 0xFFFE, true);
           itemView.setUint16(2, 0xE000, true);
           itemView.setUint32(4, itemBody.length, true); // Explicit Length for Item
           
           itemChunks.push(itemHeader);
           itemChunks.push(itemBody);
       }
       
       // Sequence Delimitation Item (FFFE, E0DD) Length 0
       const seqDelim = new Uint8Array(8);
       const seqDelimView = new DataView(seqDelim.buffer);
       seqDelimView.setUint16(0, 0xFFFE, true);
       seqDelimView.setUint16(2, 0xE0DD, true);
       seqDelimView.setUint32(4, 0, true);
       
       itemChunks.push(seqDelim);
       
       // Concatenate all items content (without SQ header yet)
       valueBytes = concatChunks(itemChunks);
   } else if (element.Value instanceof Uint8Array) {
       valueBytes = element.Value;
   } else if (element.Value instanceof ArrayBuffer) {
        valueBytes = new Uint8Array(element.Value);
   } else if (Array.isArray(element.Value) && element.Value.length > 0 && element.Value[0] instanceof Uint8Array) {
       const totalLen = (element.Value as Uint8Array[]).reduce((a, b) => a + b.length, 0);
       valueBytes = new Uint8Array(totalLen);
       let off = 0;
       for (const v of (element.Value as Uint8Array[])) {
           valueBytes.set(v, off);
           off += v.length;
       }
   } else {
       // String or Number
       let valStr: string = '';
       if (element.Value === undefined || element.Value === null) {
           valStr = '';
       } else if (Array.isArray(element.Value)) {
           valStr = element.Value.join('\\');
       } else {
           // Optimized: Fast path for common cases
           const val = element.Value;
           if (val === undefined || val === null) {
               valStr = '';
           } else if (typeof val === 'string') {
               valStr = val;
           } else if (typeof val === 'number') {
               valStr = String(val);
           } else if (Array.isArray(val)) {
               // Optimized array join - check if all strings first
               if (val.length === 0) {
                   valStr = '';
               } else if (val.length === 1) {
                   valStr = String(val[0]);
               } else {
                   valStr = val.join('\\');
               }
           } else if (typeof val === 'object') {
               // Handle parsed objects
               if ('Alphanumeric' in val) {
                   valStr = (val as any).Alphanumeric || '';
               } else if (val instanceof Date) {
                   // Optimized Date/Time conversion
                   const iso = val.toISOString();
                   if (vr === 'DA') {
                        valStr = iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10);
                   } else if (vr === 'TM') {
                        valStr = iso.slice(11, 13) + iso.slice(14, 16) + iso.slice(17, 19);
                   } else if (vr === 'DT') {
                        valStr = iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10) + 
                                iso.slice(11, 13) + iso.slice(14, 16) + iso.slice(17, 19);
                   } else {
                        valStr = String(val);
                   }
               } else if ('value' in val && 'unit' in val) {
                   valStr = `${(val as any).value}${(val as any).unit}`;
               } else {
                   valStr = String(val);
               }
           } else {
               valStr = String(val);
           }
       }
       
       // Encode string to bytes
       const strLen = valStr.length;
       if (strLen === 0) {
           valueBytes = new Uint8Array(0);
       } else {
           valueBytes = encoder.encode(valStr);
           
           // Optimized padding - inline check and pad
           if (valueBytes.length % 2 !== 0) {
               const padChar = SPACE_PADDED_VRS.has(vr) ? 0x20 : 0x00;
               const padded = new Uint8Array(valueBytes.length + 1);
               padded.set(valueBytes);
               padded[valueBytes.length] = padChar;
               valueBytes = padded;
           }
       }
   }
   
   if (!valueBytes) {
      // Empty value
      valueBytes = new Uint8Array(0);
   }

   // Optimized: Write Element Header - use direct buffer operations where possible
   const valueLen = valueBytes.length;
   const headerLen = isLongVR ? 12 : 8;
   const buffer = new Uint8Array(headerLen + valueLen);
   const view = new DataView(buffer.buffer);
   
   // Tag (little endian)
   view.setUint16(0, group, true);
   view.setUint16(2, elem, true);
   
   // VR (direct byte assignment is faster)
   const vr0 = vr.charCodeAt(0);
   const vr1 = vr.charCodeAt(1);
   buffer[4] = vr0;
   buffer[5] = vr1;
   
   // Length
   if (isLongVR) {
       view.setUint16(6, 0, true); // Reserved
       
       if (vr === 'SQ') {
           view.setUint32(8, 0xFFFFFFFF, true); // Undefined Length for SQ
       } else {
           view.setUint32(8, valueLen, true);
       }
       // Copy value bytes
       if (valueLen > 0) {
           buffer.set(valueBytes, 12);
       }
   } else {
       view.setUint16(6, valueLen, true);
       // Copy value bytes
       if (valueLen > 0) {
           buffer.set(valueBytes, 8);
       }
   }
   
   return buffer;
}
