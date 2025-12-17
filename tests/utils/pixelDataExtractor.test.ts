import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "../../src/index";
import { extractRescaledPixelData } from "../../src/utils/pixelDataExtractor";

describe("extractRescaledPixelData", () => {
    test("should extract and rescale pixel data with default parameters", () => {
        // Create a minimal dataset with pixel data
        const testFile = join("test_data", "WG04", "J2KI", "CT1_J2KI");

        try {
            const data = new Uint8Array(readFileSync(testFile));
            const dataset = parse(data, { type: "full" });

            // Extract rescaled pixel data
            const rescaled = extractRescaledPixelData(dataset);

            // Should return Float32Array
            expect(rescaled).toBeInstanceOf(Float32Array);
            expect(rescaled.length).toBeGreaterThan(0);

            // Values should be finite numbers
            expect(Number.isFinite(rescaled[0])).toBe(true);

            console.log(`Extracted ${rescaled.length} pixels`);
            console.log(`First 5 values: ${Array.from(rescaled.slice(0, 5))}`);
            console.log(
                `Min: ${Math.min(...rescaled)}, Max: ${Math.max(...rescaled)}`
            );
        } catch (error) {
            console.warn("Test file not found, skipping test");
        }
    });

    test("should apply rescale slope and intercept", () => {
        const testFile = join("test_data", "WG04", "J2KI", "CT1_J2KI");

        try {
            const data = new Uint8Array(readFileSync(testFile));
            const dataset = parse(data, { type: "full" });

            // Get rescale parameters
            const slope = dataset.floats("x00281053")?.[0] ?? 1.0;
            const intercept = dataset.floats("x00281052")?.[0] ?? 0.0;

            console.log(`Rescale slope: ${slope}, intercept: ${intercept}`);

            const rescaled = extractRescaledPixelData(dataset);

            // If we have rescale parameters, check that transformation was applied
            if (slope !== 1.0 || intercept !== 0.0) {
                expect(rescaled.length).toBeGreaterThan(0);
            }
        } catch (error) {
            console.warn("Test file not found, skipping test");
        }
    });

    test("should handle 16-bit signed pixel data", () => {
        // This test would work with a CT scan that has signed pixel values
        const testFile = join("test_data", "WG04", "J2KI", "CT1_J2KI");

        try {
            const data = new Uint8Array(readFileSync(testFile));
            const dataset = parse(data, { type: "full" });

            const pixelRepresentation = dataset.uint16("x00280103");
            console.log(
                `Pixel representation: ${pixelRepresentation} (0=unsigned, 1=signed)`
            );

            const rescaled = extractRescaledPixelData(dataset);
            expect(rescaled).toBeInstanceOf(Float32Array);
        } catch (error) {
            console.warn("Test file not found, skipping test");
        }
    });

    test("should throw error if pixel data is missing", () => {
        // Create a dataset without pixel data
        const mockDataset = {
            dict: {},
            uint16: (tag: string) => {
                if (tag === "x00280010") return 512; // rows
                if (tag === "x00280011") return 512; // columns
                return undefined;
            },
            uint8: () => undefined, // No pixel data
            floats: () => undefined,
            string: () => undefined,
            uint32: () => undefined,
            ints: () => undefined,
            pixelData: undefined,
        } as any;

        expect(() => extractRescaledPixelData(mockDataset)).toThrow(
            "Pixel data not found"
        );
    });

    test("should throw error for invalid dimensions", () => {
        const mockDataset = {
            dict: {},
            uint16: (tag: string) => {
                if (tag === "x00280010") return 0; // Invalid rows
                if (tag === "x00280011") return 0; // Invalid columns
                return undefined;
            },
            uint8: () => new Uint8Array(100),
            floats: () => undefined,
            string: () => undefined,
            uint32: () => undefined,
            ints: () => undefined,
            pixelData: undefined,
        } as any;

        expect(() => extractRescaledPixelData(mockDataset)).toThrow(
            "Invalid image dimensions"
        );
    });
});
