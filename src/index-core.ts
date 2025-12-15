/**
 * RAD-Parser Core: DICOM Parser without Codecs
 *
 * This entry point exports only the parser logic, tag utilities, and interfaces.
 * Consumers must register their own codecs or use the 'rad-parser/codecs' package.
 */

// Global Compression Utils
export {
    decompressJPEG,
    decompressPixelData,
    supportsImageDecoder,
} from "./utils/compression";

// Dictionary (Optional but usually part of core)
export { dicomDictionary, getTagName, isPrivateTag } from "./utils/dictionary";
export { DicomParseError, createParseError } from "./core/errors";

export {
    canParse,
    parseWithMetadata,
    parse, // Unified API
    parseAndDecode,
    type ParseResult,
    type ParseOptions,
    type UnifiedParseOptions,
    extractPixelData,
} from "./core/parser";

export { initCoreWasm } from "./core/wasm-opt";

export { write, type WriteOptions } from "./core/writer";
export { anonymize, type AnonymizationOptions } from "./core/anonymizer";

export {
    extractTransferSyntax,
    TRANSFER_SYNTAX,
} from "./utils/extractTransferSyntax";

export {
    isCompressedTransferSyntax,
    type PixelDataResult,
} from "./utils/pixelData";

export { SafeDataView } from "./utils/SafeDataView";
export { parseSequence } from "./utils/sequenceParser";

export {
    StreamingParser,
    parseFromAsyncIterator,
    parseFromStream,
    type ElementCallback,
    type StreamingOptions,
} from "./core/streaming";

export { formatTagWithComma, normalizeTag } from "./utils/tagUtils";

export type {
    DicomDataSet,
    DicomElement,
    ShallowDicomDataSet,
    ShallowDicomElement,
    PixelDataInfo,
} from "./core/types";

export {
    parseAgeString,
    parseDate,
    parseDateTime,
    parsePersonName,
    parseTime,
    parseValueByVR,
} from "./utils/valueParsers";

export {
    detectVR,
    detectVRForPrivateTag,
    requiresExplicitLength,
} from "./utils/vrDetection";

// Codec Registry (Core Logic)
export {
    registry,
    type PixelDataCodec,
    type FunctionalCodecConfig,
    CodecRegistry,
    type CodecInfo,
} from "./core/registry";

// Helpers
export { decodePixelData, encodePixelData } from "./core/codec-helpers";
