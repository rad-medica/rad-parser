/**
 * Comprehensive DICOM Parser Benchmark (JS vs WASM)
 *
 * Compares all rad-parser modes (full, shallow, fast, medium) + streaming
 * in both pure JavaScript and WASM-accelerated versions
 * against other parsers (dcmjs, dicom-parser, efferent-dicom)
 * Grouped by test sets: TEST_STUDY and EDGE_CASES
 */

import dcmjs from "dcmjs";
import dicomParser from "dicom-parser";
import efferentDicom from "efferent-dicom";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { StreamingParser, initCoreWasm, parse } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BenchmarkResult {
    parser: string;
    file: string;
    testSet: string;
    fileSize: number;
    success: boolean;
    parseTime: number;
    elementCount: number;
    error?: string;
}

interface ParserStats {
    parser: string;
    testSet: string;
    totalFiles: number;
    successful: number;
    failed: number;
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
    totalElements: number;
    averageElements: number;
    totalSize: number;
    averageSize: number;
    errors: string[];
}

/**
 * Get all DICOM files recursively
 */
function getAllDicomFiles(dir: string): string[] {
    const files: string[] = [];
    try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...getAllDicomFiles(fullPath));
            } else if (
                entry.isFile() &&
                !entry.name.endsWith(".txt") &&
                !entry.name.endsWith(".md")
            ) {
                try {
                    const stat = statSync(fullPath);
                    if (stat.size > 0) {
                        files.push(fullPath);
                    }
                } catch {
                    // Skip
                }
            }
        }
    } catch {
        // Skip
    }
    return files;
}

function parseWithDcmjs(data: Uint8Array) {
    const buffer = Buffer.from(
        data.buffer,
        data.byteOffset,
        data.byteLength
    ) as Buffer;
    const dcmjsModule = dcmjs as any;
    const message = dcmjsModule.data.DicomMessage.readFile(buffer);
    return { dict: message?.dict ?? {} };
}

function parseWithDicomParser(data: Uint8Array) {
    const dataset = dicomParser.parseDicom(data);
    return { dict: dataset.elements ?? {} };
}

function parseWithEfferentDicom(data: Uint8Array) {
    const reader = new (efferentDicom as any).DicomReader(data);
    const dict = reader.DicomTags ?? {};
    return { dict };
}

/**
 * Benchmark a single parser on a file
 */
function benchmarkParser(
    parserName: string,
    filePath: string,
    fileData: Uint8Array,
    testSet: string
): BenchmarkResult {
    const startTime = performance.now();
    let success = false;
    let elementCount = 0;
    let error: string | undefined;

    try {
        let dataset;
        // Check if this is a rad-parser variant
        if (parserName.startsWith("rad-")) {
            const isWasm = parserName.endsWith("-wasm");
            const mode = parserName.includes("-fast")
                ? "fast"
                : parserName.includes("-shallow")
                  ? "shallow"
                  : parserName.includes("-medium")
                    ? "light"
                    : parserName.includes("-full") ||
                        parserName === "rad-parser"
                      ? "full"
                      : "full";

            if (parserName.includes("-streaming")) {
                const chunkSize = 32768;
                let streamingSuccess = false;
                let streamingElements = 0;
                let streamingError: string | undefined;

                const parser = new StreamingParser({
                    maxBufferSize: 50 * 1024 * 1024,
                    maxIterations: 500,
                    enableWasm: isWasm,
                    onElement: (element: { dict: any }) => {
                        streamingElements += Object.keys(
                            element.dict || {}
                        ).length;
                        streamingSuccess = true;
                    },
                    onError: (err: { message: string }) => {
                        streamingError = err.message;
                    },
                });

                try {
                    const streamStartTime = performance.now();
                    const maxStreamTime = 5000;
                    for (let i = 0; i < fileData.length; i += chunkSize) {
                        if (
                            performance.now() - streamStartTime >
                            maxStreamTime
                        ) {
                            error = "Streaming timeout";
                            break;
                        }
                        const chunk = fileData.slice(
                            i,
                            Math.min(i + chunkSize, fileData.length)
                        );
                        if (i === 0) {
                            parser.initialize(chunk);
                        } else {
                            parser.processChunk(chunk);
                        }
                    }
                    parser.finalize();
                    success = streamingSuccess || streamingElements > 0;
                    elementCount = streamingElements;
                    if (streamingError && !success) error = streamingError;
                } catch (e) {
                    error = e instanceof Error ? e.message : String(e);
                    success = false;
                }
            } else {
                dataset = parse(fileData, {
                    type: mode as any,
                    enableWasm: isWasm,
                });
                elementCount = Object.keys(
                    mode === "fast" || mode === "shallow"
                        ? dataset
                        : (dataset as any).dict || {}
                ).length;
                success = true;
            }
        } else {
            // Competitors
            switch (parserName) {
                case "dcmjs":
                    dataset = parseWithDcmjs(fileData);
                    elementCount = Object.keys(dataset.dict || {}).length;
                    break;
                case "dicom-parser":
                    dataset = parseWithDicomParser(fileData);
                    elementCount = Object.keys(dataset.dict || {}).length;
                    break;
                case "efferent-dicom":
                    dataset = parseWithEfferentDicom(fileData);
                    elementCount = Object.keys(dataset.dict || {}).length;
                    break;
                default:
                    throw new Error(`Unknown parser: ${parserName}`);
            }
            success = true;
        }
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        success = false;
    }

    const parseTime = performance.now() - startTime;
    return {
        parser: parserName,
        file: filePath.split(/[/\\]/).pop() || filePath,
        testSet,
        fileSize: fileData.length,
        success,
        parseTime,
        elementCount,
        error,
    };
}

function calculateStats(
    parserName: string,
    testSet: string,
    results: BenchmarkResult[]
): ParserStats {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalTime = successful.reduce((sum, r) => sum + r.parseTime, 0);
    const totalElements = successful.reduce(
        (sum, r) => sum + r.elementCount,
        0
    );
    const totalSize = results.reduce((sum, r) => sum + r.fileSize, 0);
    const times = successful.map(r => r.parseTime);

    return {
        parser: parserName,
        testSet,
        totalFiles: results.length,
        successful: successful.length,
        failed: failed.length,
        totalTime,
        averageTime: successful.length > 0 ? totalTime / successful.length : 0,
        minTime: times.length > 0 ? Math.min(...times) : 0,
        maxTime: times.length > 0 ? Math.max(...times) : 0,
        totalElements,
        averageElements:
            successful.length > 0 ? totalElements / successful.length : 0,
        totalSize,
        averageSize: results.length > 0 ? totalSize / results.length : 0,
        errors: failed.map(r => `${r.file}: ${r.error || "Unknown"}`),
    };
}

function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)} μs`;
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Main benchmark function
 */
async function main() {
    console.log("\n" + "=".repeat(80));
    console.log("Comprehensive DICOM Parser Benchmark (JS vs WASM)");
    console.log("=".repeat(80) + "\n");

    // Initialize WASM once
    console.log("Initializing Wasm...");
    try {
        await initCoreWasm();
        console.log("Wasm initialized successfully.\n");
    } catch (err) {
        console.error("Failed to initialize Wasm:", err);
    }

    const testSets = ["TEST_STUDY", "EDGE_CASES"];
    const testDataDir = join(__dirname, "..", "test_data");

    const allResults: BenchmarkResult[] = [];
    const parsers = [
        "rad-fast-js",
        "rad-fast-wasm",
        "rad-shallow-js",
        "rad-shallow-wasm",
        "rad-medium-js",
        "rad-medium-wasm",
        "rad-full-js",
        "rad-full-wasm",
        "rad-streaming-js",
        "rad-streaming-wasm",
        "dcmjs",
        "dicom-parser",
        "efferent-dicom",
    ];

    for (const testSetName of testSets) {
        const testSetPath = join(testDataDir, testSetName);
        if (!existsSync(testSetPath)) {
            console.log(`Skipping missing test set: ${testSetName}`);
            continue;
        }

        const files = getAllDicomFiles(testSetPath);
        console.log(`\nFound ${files.length} files in ${testSetName}`);

        const fileData: Array<{ path: string; data: Uint8Array }> = [];
        for (const filePath of files) {
            try {
                const data = readFileSync(filePath);
                fileData.push({ path: filePath, data: new Uint8Array(data) });
            } catch {}
        }

        console.log(`Loaded ${fileData.length} files for ${testSetName}`);

        for (const parserName of parsers) {
            console.log(`\nBenchmarking ${parserName} on ${testSetName}...`);
            const startParserTime = performance.now();
            let processed = 0;

            for (const { path, data } of fileData) {
                processed++;
                if (processed % 50 === 0 || processed === fileData.length) {
                    const elapsed =
                        (performance.now() - startParserTime) / 1000;
                    const rate = elapsed > 0 ? processed / elapsed : 0;
                    console.log(
                        `  [${processed}/${fileData.length}] (${rate.toFixed(1)} files/s)`
                    );
                }
                allResults.push(
                    benchmarkParser(parserName, path, data, testSetName)
                );
            }
            console.log(
                `  ✓ Completed ${testSetName} in ${((performance.now() - startParserTime) / 1000).toFixed(1)}s`
            );
        }
    }

    const stats: ParserStats[] = [];
    for (const testSetName of testSets) {
        for (const parserName of parsers) {
            const groupResults = allResults.filter(
                r => r.parser === parserName && r.testSet === testSetName
            );
            if (groupResults.length > 0) {
                stats.push(
                    calculateStats(parserName, testSetName, groupResults)
                );
            }
        }
    }

    console.log("\nSummary by Test Set:\n" + "-".repeat(120));
    for (const testSetName of testSets) {
        console.log(`\n--- ${testSetName} ---`);
        console.log(
            `${"Parser".padEnd(25)} ${"Files".padEnd(8)} ${"Success %".padEnd(12)} ${"Avg Time".padEnd(12)} ${"Min Time".padEnd(12)} ${"Avg Elements"}`
        );

        stats
            .filter(s => s.testSet === testSetName)
            .sort(
                (a, b) =>
                    b.successful / b.totalFiles - a.successful / a.totalFiles ||
                    a.averageTime - b.averageTime
            )
            .forEach(s => {
                const rate = ((s.successful / s.totalFiles) * 100).toFixed(1);
                console.log(
                    `${s.parser.padEnd(25)} ${s.totalFiles.toString().padEnd(8)} ${rate.padEnd(11)}% ${formatTime(s.averageTime).padEnd(12)} ${formatTime(s.minTime).padEnd(12)} ${s.averageElements.toFixed(0)}`
                );
            });
    }

    const resultsDir = join(__dirname, "results");
    if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

    const replacer = (key: string, value: any) => {
        if (typeof value === "bigint") return value.toString();
        if (value instanceof Uint8Array)
            return `[Binary: ${value.length} bytes]`;
        return value;
    };

    writeFileSync(
        join(resultsDir, "comprehensive-benchmark-stats.json"),
        JSON.stringify(stats, replacer, 2)
    );
    writeFileSync(
        join(resultsDir, "comprehensive-benchmark-results.json"),
        JSON.stringify(allResults, replacer, 2)
    );
}

main().catch(console.error);
