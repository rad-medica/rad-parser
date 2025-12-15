/**
 * Type definitions for RAD-Parser
 *
 * These types define the interface for DICOM data structures
 * compatible with the SmallVis parser system.
 */

/**
 * Sequence Item structure
 */
export interface SequenceItem {
  elements: Record<string, DicomElement>;
  normalizedElements: Record<string, DicomElement>;
}

/**
 * DICOM Element structure
 * Compatible with SmallVis parser types (matches src/core/parsers/types.ts)
 */
export interface DicomElement {
  vr?: string;
  VR?: string;
  Value?: string | number | Array<string | number> | Record<string, unknown> | Uint8Array | Array<Uint8Array> | ArrayBuffer | Float64Array | Int32Array;
  value?: string | number | Array<string | number> | Record<string, unknown> | Uint8Array | Array<Uint8Array> | ArrayBuffer | Float64Array | Int32Array;
  length?: number;
  Length?: number;
  items?: unknown[];
  Items?: unknown[];
  [key: string]: unknown;
}

/**
 * DICOM Data Set structure
 * Provides access methods compatible with dcmjs format
 */
export interface DicomDataSet {
  // Access methods for compatibility
  string: (tag: string) => string | undefined;
  uint16: (tag: string) => number | undefined;
  int16: (tag: string) => number | undefined;
  floatString: (tag: string) => number | undefined;
  intString?: (tag: string) => number | undefined;
  // Native dict structure
  dict: Record<string, DicomElement>;
  // Elements accessor for backward compatibility (normalized tags)
  elements: Record<string, DicomElement>;
  
  // Optional Metadata
  transferSyntax?: string;
  characterSet?: string;
  rows?: number;
  columns?: number;
}


/**
 * Shallow DICOM Element structure
 * Contains only location information, no values
 */
export interface ShallowDicomElement {
  tag?: string;  // Optional: redundant with dict key
  vr: string;
  length: number;
  dataOffset: number;
}

/**
 * Shallow DICOM Data Set
 * Map of tag -> ShallowDicomElement
 */
export interface ShallowDicomDataSet {
  [tag: string]: ShallowDicomElement;
}

/**
 * Pixel Data information structure
 */
export interface PixelDataInfo {
  pixelData: Uint8Array; // The raw pixel data bytes
  transferSyntax: string;
  isEncapsulated: boolean;
  fragments?: Uint8Array[]; // For encapsulated data
  rows?: number;
  columns?: number;
  bitsAllocated?: number;
  samplesPerPixel?: number;
  photometricInterpretation?: string;
}
