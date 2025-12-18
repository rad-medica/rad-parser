/**
 * Error Handling: Custom error types for better error reporting
 */

/**
 * Custom error for DICOM parsing failures
 */
export class DicomParseError extends Error {
    constructor(
        message: string,
        public readonly tag?: string,
        public readonly offset?: number,
        cause?: Error
    ) {
        super(message, { cause });
        this.name = "DicomParseError";
    }
}

/**
 * Create a parse error with context
 */
export function createParseError(
    message: string,
    tag?: string,
    offset?: number,
    cause?: Error
): DicomParseError {
    let fullMessage = message;
    if (tag) {
        fullMessage += ` (tag: ${tag})`;
    }
    if (offset !== undefined) {
        fullMessage += ` (offset: ${offset})`;
    }
    return new DicomParseError(fullMessage, tag, offset, cause);
}
