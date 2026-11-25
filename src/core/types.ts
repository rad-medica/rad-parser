/**
 * Type definitions for RAD-Parser
 *
 * These types define the interface for DICOM data structures
 * compatible with the radspider web parser system.
 */

/**
 * Sequence Item structure
 */
export interface SequenceItem {
    elements: Record<string, DicomElement>;
    normalizedElements: Record<string, DicomElement>;
}

/**
 * Location of one encapsulated Pixel Data fragment (PS3.5 A.4).
 * `offset` is the absolute byte offset of the fragment value (after the
 * 8-byte Item header) in the parsed byte array; `length` is its byte length.
 */
export interface PixelDataFragment {
    offset: number;
    length: number;
}

/** Any decoded element value. */
export type DicomValue =
    | string
    | number
    | bigint
    | Array<string | number | bigint>
    | Record<string, unknown>
    | Uint8Array
    | Array<Uint8Array>
    | ArrayBuffer
    | Float64Array
    | Int32Array
    | SequenceItem[];

/**
 * DICOM Element structure
 * Compatible with radspider web parser types
 */
export interface DicomElement {
    vr?: string;
    VR?: string;
    Value?: DicomValue;
    value?: DicomValue;
    length?: number;
    Length?: number;
    items?: unknown[];
    Items?: unknown[];
    /** Absolute byte offset of the Value Field in the parsed byte array. */
    dataOffset?: number;
    /** True for encapsulated (undefined length) Pixel Data. */
    isEncapsulated?: boolean;
    /** Basic Offset Table entries (encapsulated Pixel Data), may be empty. */
    basicOffsetTable?: number[];
    /** Fragment locations (encapsulated Pixel Data), Basic Offset Table excluded. */
    fragments?: PixelDataFragment[];
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
    intString: (tag: string) => number | undefined;
    // Native dict structure
    dict: Record<string, DicomElement>;
    // Elements accessor for backward compatibility (normalized tags)
    elements: Record<string, DicomElement>;

    // Optional Metadata
    transferSyntax?: string;
    /**
     * The bytes that `dataOffset` / `fragments` offsets refer to: the input
     * array, or for Deflated Explicit VR Little Endian the inflated file
     * (original header followed by the inflated Data Set). Non-enumerable.
     */
    byteArray?: Uint8Array;
    characterSet?: string;
    rows?: number;
    columns?: number;
}

/**
 * Shallow DICOM Element structure
 * Contains only location information, no values
 */
export interface ShallowDicomElement {
    tag?: string; // Optional: redundant with dict key
    vr: string;
    length: number;
    dataOffset: number;
    /** Encapsulated Pixel Data only: fragment locations. */
    fragments?: PixelDataFragment[];
    /** Encapsulated Pixel Data only: Basic Offset Table entries. */
    basicOffsetTable?: number[];
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
