/**
 * RAD-Parser (dictionary-free bundle)
 *
 * This entry point mirrors `src/index.ts` but omits the dictionary helpers to keep
 * the bundle size small when only core parsing utilities are needed.
 */

export { DicomParseError, createParseError } from "./core/errors";
export {
    isCompressedTransferSyntax,
    type PixelDataResult,
} from "./utils/pixelData";
export {
    canParse,
    parseWithMetadata,
    type ParseResult,
    type ParseOptions,
    extractPixelData,
} from "./core/parser";
export {
    extractTransferSyntax,
    TRANSFER_SYNTAX,
} from "./utils/extractTransferSyntax";
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
export type { DicomDataSet, DicomElement } from "./core/types";
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
