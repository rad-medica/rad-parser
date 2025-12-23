import fs from "fs";
import path from "path";
import { parse } from "../src/index";

// Tag Constants
const TAG_TRANSFER_SYNTAX = "x00020010";
const TAG_PIXEL_DATA = "x7fe00010";

async function main() {
    const outputDir = path.join(__dirname, "../test_data/output_conversion");
    if (!fs.existsSync(outputDir)) {
        console.error("Output directory not found:", outputDir);
        process.exit(1);
    }

    const files = fs.readdirSync(outputDir).filter(f => f.endsWith(".dcm"));
    console.log(`Found ${files.length} DICOM files in ${outputDir}`);

    let failures = 0;

    for (const file of files) {
        const filePath = path.join(outputDir, file);
        console.log(`\nVerifying ${file}...`);

        try {
            const buffer = fs.readFileSync(filePath);

            // Parse using the main API
            const dataset = (await parse(buffer)) as any;

            // Cast elements to allow access by string
            const elements = dataset.elements as Record<string, any>;

            // Debug keys
            console.log("Dataset Keys:", Object.keys(dataset));
            if (dataset.elements) {
                console.log(
                    "Elements Keys Sample:",
                    Object.keys(elements).slice(0, 5)
                );
            } else {
                console.log("No elements property on dataset!");
            }

            // Transfer Syntax
            let txnElement = elements[TAG_TRANSFER_SYNTAX];
            // If not found, maybe in dataset.meta? (Some parsers separate it)
            if (!txnElement && dataset.meta) {
                txnElement =
                    dataset.meta[TAG_TRANSFER_SYNTAX] ||
                    dataset.meta[TAG_TRANSFER_SYNTAX.toUpperCase()];
            }
            // Maybe case sensitivity? (Usually parsers normalize to UPPER or lower)
            if (!txnElement) {
                // Try searching keys
                const key = Object.keys(elements).find(
                    k =>
                        k === TAG_TRANSFER_SYNTAX ||
                        k.toUpperCase() === TAG_TRANSFER_SYNTAX
                );
                if (key) txnElement = elements[key];
            }

            const txnSyntax = txnElement ? txnElement.value : "Unknown";

            // Clean up string (sometimes padded)
            const txnSyntaxClean = Array.isArray(txnSyntax)
                ? txnSyntax[0].trim()
                : typeof txnSyntax === "string"
                  ? txnSyntax.trim()
                  : String(txnSyntax);

            console.log(`  Transfer Syntax: ${txnSyntaxClean}`);

            // Check for Pixel Data
            const pixelData = dataset.elements[TAG_PIXEL_DATA];
            if (!pixelData) {
                console.error("  [FAIL] No Pixel Data element found!");
                failures++;
                continue;
            }

            console.log(
                `  Pixel Data Found. Length: ${pixelData.length} bytes (Element length)`
            );

            // Verify expected syntax based on filename
            const expectedSyntax = getExpectedSyntax(file);
            if (expectedSyntax) {
                // Ignore null terminator if present
                const current = txnSyntaxClean.replace(/\0/g, "");
                if (current !== expectedSyntax) {
                    console.error(
                        `  [FAIL] Expected Syntax ${expectedSyntax}, but got ${current}`
                    );
                    failures++;
                } else {
                    console.log("  [PASS] Transfer Syntax matches.");
                }
            }
        } catch (err) {
            console.error(`  [FAIL] Error parsing file: ${err}`);
            failures++;
        }
    }

    console.log("\n--------------------------------------------------");
    if (failures === 0) {
        console.log("ALL CHECKS PASSED ✅");
        process.exit(0);
    } else {
        console.error(`${failures} CHECK(S) FAILED ❌`);
        process.exit(1);
    }
}

function getExpectedSyntax(filename: string): string | null {
    if (filename.includes("rle")) return "1.2.840.10008.1.2.5";
    if (filename.includes("j2k")) return "1.2.840.10008.1.2.4.90";
    if (filename.includes("jpeg_base")) return "1.2.840.10008.1.2.4.50";
    if (filename.includes("jpegls")) return "1.2.840.10008.1.2.4.80";
    if (filename.includes("native")) return "1.2.840.10008.1.2.1";
    return null;
}

main().catch(console.error);
