import { describe, it, expect } from "vitest";
import { parse } from "../../src/index";
import * as fs from "fs";
import * as path from "path";

const TEST_DATA_DIR = path.resolve(__dirname, "../test_data/patient/DICOM");

describe("Test Data Verification", () => {
    it("should successfully parse all DICOM files in the test directory", () => {
        // Check if directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            console.warn(`Test data directory not found: ${TEST_DATA_DIR}`);
            return;
        }

        const files = fs
            .readdirSync(TEST_DATA_DIR)
            .filter((file) => !file.includes("Zone.Identifier"));

        let successCount = 0;
        let failureCount = 0;
        const errors: string[] = [];

        files.forEach((file) => {
            const filePath = path.join(TEST_DATA_DIR, file);
            // Skip directories if any
            if (fs.statSync(filePath).isDirectory()) return;

            try {
                const buffer = fs.readFileSync(filePath);
                // Convert Node Buffer to Uint8Array which is expected by the parser
                const uint8Array = new Uint8Array(buffer);

                const dataset = parse(uint8Array, { type: "full" });

                // Basic assertion: check if we got a valid dataset object
                expect(dataset).toBeDefined();

                // Ensure we actually parsed something (avoid empty datasets due to parsing errors)
                if (Object.keys(dataset.dict).length === 0) {
                    throw new Error("Parsed dataset is empty");
                }

                successCount++;
            } catch (error) {
                failureCount++;
                errors.push(`Failed to parse ${file}: ${error}`);
            }
        });

        console.log(`Parsed ${successCount} files successfully.`);
        if (failureCount > 0) {
            console.error(`Failed to parse ${failureCount} files.`);
            console.error(errors.join("\n"));
        }

        expect(failureCount).toBe(0);
    }, 60000); // Increase timeout to 60s
});
