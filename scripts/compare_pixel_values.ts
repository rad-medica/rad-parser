/**
 * Compare pixel values between original and converted images
 * to identify value corruption issues
 */

import * as fs from "fs";
import * as path from "path";
import "../src/codecs/auto-register";
import { decodePixelData } from "../src/core/codec-helpers";
import { parse as parser } from "../src/index";
import { extractPixelData } from "../src/utils/pixelDataExtractor";

const ORIGINAL_FILE =
    process.argv[2] ||
    path.resolve(__dirname, "../test_data/EDGE_CASES/ALL/CT_small.dcm");
const CONVERTED_DIR = path.resolve(__dirname, "../test_data/converted_codecs");

interface PixelComparison {
    file: string;
    transferSyntax: string;
    dimensions: string;
    pixelDataSize: number;
    firstPixels: number[];
    lastPixels: number[];
    minValue: number;
    maxValue: number;
    meanValue: number;
    matchesOriginal: boolean;
    differences: number;
}

async function extractPixelValues(dataset: any): Promise<{
    pixels: Uint8Array;
    dimensions: string;
    transferSyntax: string;
}> {
    const rows = dataset.uint16("x00280010") || 0;
    const columns = dataset.uint16("x00280011") || 0;
    const samples = dataset.uint16("x00280002") || 1;
    const bits = dataset.uint16("x00280100") || 8;
    const transferSyntax = dataset.string("x00020010") || "Unknown";

    const pixelDataInfo = extractPixelData(dataset);
    if (!pixelDataInfo) {
        throw new Error("No pixel data found");
    }

    let pixels: Uint8Array;

    if (pixelDataInfo.isEncapsulated) {
        const fragments = Array.isArray(pixelDataInfo.Value)
            ? (pixelDataInfo.Value as Uint8Array[])
            : [pixelDataInfo.Value as Uint8Array];

        pixels = await decodePixelData(transferSyntax, fragments, {
            rows,
            columns,
            samplesPerPixel: samples,
            bitsAllocated: bits,
            width: columns,
            height: rows,
        });
    } else {
        if (pixelDataInfo.Value instanceof Uint8Array) {
            pixels = pixelDataInfo.Value;
        } else {
            throw new Error("Invalid pixel data format");
        }
    }

    return {
        pixels,
        dimensions: `${columns}x${rows}`,
        transferSyntax,
    };
}

function analyzePixels(pixels: Uint8Array): {
    firstPixels: number[];
    lastPixels: number[];
    minValue: number;
    maxValue: number;
    meanValue: number;
} {
    const firstPixels = Array.from(
        pixels.slice(0, Math.min(20, pixels.length))
    );
    const lastPixels = Array.from(
        pixels.slice(Math.max(0, pixels.length - 20), pixels.length)
    );

    let min = 255;
    let max = 0;
    let sum = 0;

    for (let i = 0; i < pixels.length; i++) {
        const val = pixels[i]!;
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
    }

    return {
        firstPixels,
        lastPixels,
        minValue: min,
        maxValue: max,
        meanValue: sum / pixels.length,
    };
}

async function main() {
    console.log("=".repeat(80));
    console.log("Pixel Value Comparison Report");
    console.log("=".repeat(80));
    console.log(`\nOriginal file: ${ORIGINAL_FILE}\n`);

    // Read original
    const originalData = fs.readFileSync(ORIGINAL_FILE);
    const originalDataset = parser(
        new Uint8Array(
            originalData.buffer,
            originalData.byteOffset,
            originalData.byteLength
        )
    );

    const originalPixels = await extractPixelValues(originalDataset);
    const originalStats = analyzePixels(originalPixels.pixels);

    console.log("Original Image:");
    console.log(`  Dimensions: ${originalPixels.dimensions}`);
    console.log(`  Transfer Syntax: ${originalPixels.transferSyntax}`);
    console.log(`  Pixel data size: ${originalPixels.pixels.length} bytes`);
    console.log(`  First 20 pixels: ${originalStats.firstPixels.join(", ")}`);
    console.log(`  Last 20 pixels: ${originalStats.lastPixels.join(", ")}`);
    console.log(
        `  Min: ${originalStats.minValue}, Max: ${originalStats.maxValue}, Mean: ${originalStats.meanValue.toFixed(2)}`
    );
    console.log();

    // Read converted files
    const files = fs.readdirSync(CONVERTED_DIR);
    const dicomFiles = files.filter(f => f.endsWith(".dcm"));

    const comparisons: PixelComparison[] = [];

    for (const file of dicomFiles) {
        const filePath = path.join(CONVERTED_DIR, file);
        console.log(`Analyzing ${file}...`);

        try {
            const data = fs.readFileSync(filePath);
            const dataset = parser(
                new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            );

            const convertedPixels = await extractPixelValues(dataset);
            const convertedStats = analyzePixels(convertedPixels.pixels);

            // Compare with original
            let differences = 0;
            const minLen = Math.min(
                originalPixels.pixels.length,
                convertedPixels.pixels.length
            );
            for (let i = 0; i < minLen; i++) {
                if (originalPixels.pixels[i] !== convertedPixels.pixels[i]) {
                    differences++;
                }
            }

            const matchesOriginal = differences === 0;

            comparisons.push({
                file,
                transferSyntax: convertedPixels.transferSyntax,
                dimensions: convertedPixels.dimensions,
                pixelDataSize: convertedPixels.pixels.length,
                firstPixels: convertedStats.firstPixels,
                lastPixels: convertedStats.lastPixels,
                minValue: convertedStats.minValue,
                maxValue: convertedStats.maxValue,
                meanValue: convertedStats.meanValue,
                matchesOriginal,
                differences,
            });

            console.log(
                `  ✓ Analyzed - ${differences} differences from original`
            );
        } catch (e: any) {
            console.log(`  ✗ Error: ${e.message}`);
            comparisons.push({
                file,
                transferSyntax: "Error",
                dimensions: "N/A",
                pixelDataSize: 0,
                firstPixels: [],
                lastPixels: [],
                minValue: 0,
                maxValue: 0,
                meanValue: 0,
                matchesOriginal: false,
                differences: -1,
            });
        }
        console.log();
    }

    // Report
    console.log("=".repeat(80));
    console.log("Comparison Summary");
    console.log("=".repeat(80));
    console.log();

    for (const comp of comparisons) {
        console.log(`${comp.file}:`);
        console.log(`  Transfer Syntax: ${comp.transferSyntax}`);
        console.log(`  Dimensions: ${comp.dimensions}`);
        console.log(`  Pixel data size: ${comp.pixelDataSize} bytes`);
        if (comp.differences >= 0) {
            console.log(
                `  Matches original: ${comp.matchesOriginal ? "YES" : "NO"} (${comp.differences} differences)`
            );
            console.log(`  First 20 pixels: ${comp.firstPixels.join(", ")}`);
            console.log(`  Last 20 pixels: ${comp.lastPixels.join(", ")}`);
            console.log(
                `  Min: ${comp.minValue}, Max: ${comp.maxValue}, Mean: ${comp.meanValue.toFixed(2)}`
            );

            // Compare with original
            if (!comp.matchesOriginal) {
                console.log(
                    `  ⚠️  WARNING: Pixel values differ from original!`
                );
                console.log(
                    `     Original first 20: ${originalStats.firstPixels.join(", ")}`
                );
                console.log(
                    `     Converted first 20: ${comp.firstPixels.join(", ")}`
                );
            }
        } else {
            console.log(`  ✗ Failed to analyze`);
        }
        console.log();
    }

    const matching = comparisons.filter(c => c.matchesOriginal).length;
    const total = comparisons.filter(c => c.differences >= 0).length;

    console.log("=".repeat(80));
    console.log(`Total files: ${comparisons.length}`);
    console.log(`Successfully analyzed: ${total}`);
    console.log(`Matching original: ${matching}`);
    console.log(`With differences: ${total - matching}`);
    console.log("=".repeat(80));
}

main().catch(console.error);

