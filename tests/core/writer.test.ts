import { describe, it, expect } from "vitest";
import { parse, write } from "../../src/index";
import * as fs from "fs";
import * as path from "path";

const TEST_FILE = path.resolve(
    __dirname,
    "../test_data/patient/DICOM/18CBDD76"
);

describe("DICOM Writer", () => {
    it("should write a parsed dataset back to a buffer", () => {
        if (!fs.existsSync(TEST_FILE)) {
            console.warn("Skipping writer test, file not found");
            return;
        }

        const originalBytes = new Uint8Array(fs.readFileSync(TEST_FILE));
        const dataset = parse(originalBytes, { type: "full" });

        const writtenBytes = write(dataset);

        expect(writtenBytes).toBeDefined();
        expect(writtenBytes.length).toBeGreaterThan(128);

        // Preamble check
        const magic = new TextDecoder().decode(writtenBytes.slice(128, 132));
        expect(magic).toBe("DICM");

        // Loopback check
        const reParsed = parse(writtenBytes, { type: "full" });
        expect(reParsed).toBeDefined();
        expect(reParsed.string("x00100010")).toBe(dataset.string("x00100010"));
    });
});
