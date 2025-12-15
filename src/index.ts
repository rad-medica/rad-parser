/**
 * RAD-Parser: In-House DICOM Parser Implementation
 *
 * A lightweight, performant, self-contained DICOM parser with no external dependencies.
 * Designed for safety and efficiency in medical imaging workloads.
 *
 * @module rad-parser
 */

/** Compression helpers exposed by the package. */
export {
    decompressJPEG,
    decompressPixelData,
    supportsImageDecoder,
} from "./utils/compression";
/** Dictionary and tag utilities */
export { dicomDictionary, getTagName, isPrivateTag } from "./utils/dictionary";
export { DicomParseError, createParseError } from "./core/errors";
/** Core parser entry points */

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
/** Pixel data utilities */
export {
    isCompressedTransferSyntax,
    type PixelDataResult,
} from "./utils/pixelData";
/** Safe byte readers and sequence helpers */
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
// Codecs & Plugins
export {
    registry,
    type PixelDataCodec,
    type FunctionalCodecConfig,
} from "./core/registry";
export { RleCodec } from "./codecs/rle";
export { BrowserImageCodec } from "./codecs/browser";
export { WebGpuDecoder } from "./codecs/webgpu";
export { WebGlDecoder } from "./codecs/webgl";
export { Jpeg2000Decoder } from "./codecs/jpeg2000";
export { JpegLsDecoder } from "./codecs/jpegls";
export { JpegLosslessDecoder } from "./codecs/jpegLossless";
export { VideoDecoder } from "./codecs/video";
export { NodePngEncoder, encodePNG } from "./codecs/png";
export { JpegLosslessNativeDecoder } from "./codecs/jpegLosslessNative";
export { JpegNativeCodec } from "./codecs/jpegNative";
export { AutoDetectCodec } from "./codecs/autodetect";

// New helper functions
export { decodePixelData, encodePixelData } from "./core/codec-helpers";
export { extractRescaledPixelData } from "./utils/pixelDataExtractor";

// Initialize dynamic codec registration
import "./codecs/auto-register";

// Register Dictionary
import { dicomDictionary as data } from "./utils/dictionary-data";
import { registerDictionary } from "./utils/dictionary";
registerDictionary(data);
