import { describe, it, expect } from "vitest";
import { DicomParseError, createParseError } from "../../src/core/errors";

describe("Error Handling", () => {
    describe("DicomParseError", () => {
        it("should create an error with message and properties", () => {
            const cause = new Error("Original error");
            const error = new DicomParseError(
                "Parsing failed",
                "x00100010",
                123,
                cause,
            );

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBe("Parsing failed");
            expect(error.name).toBe("DicomParseError");
            expect(error.tag).toBe("x00100010");
            expect(error.offset).toBe(123);
            expect(error.cause).toBe(cause);
        });

        it("should handle optional properties", () => {
            const error = new DicomParseError("Simple error");
            expect(error.message).toBe("Simple error");
            expect(error.tag).toBeUndefined();
            expect(error.offset).toBeUndefined();
            expect(error.cause).toBeUndefined();
        });
    });

    describe("createParseError", () => {
        it("should create a DicomParseError with formatted message including context", () => {
            const error = createParseError("Invalid length", "x00100020", 500);

            expect(error).toBeInstanceOf(DicomParseError);
            expect(error.message).toBe(
                "Invalid length (tag: x00100020) (offset: 500)",
            );
            expect(error.tag).toBe("x00100020");
            expect(error.offset).toBe(500);
        });

        it("should format message with only tag", () => {
            const error = createParseError("Invalid tag", "x00080008");
            expect(error.message).toBe("Invalid tag (tag: x00080008)");
        });

        it("should format message with only offset", () => {
            const error = createParseError("Unexpected EOF", undefined, 1024);
            expect(error.message).toBe("Unexpected EOF (offset: 1024)");
        });

        it("should pass through the cause", () => {
            const rootCause = new Error("IO Error");
            const error = createParseError(
                "Read failed",
                undefined,
                undefined,
                rootCause,
            );
            expect(error.cause).toBe(rootCause);
            expect(error.message).toBe("Read failed");
        });
    });
});
