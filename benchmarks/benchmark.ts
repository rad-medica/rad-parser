/**
 * DICOM Parser Benchmark
 *
 * Compares performance of different DICOM parsers using test data files.
 * Run from the SmallVis project root: npm run benchmark (from rad-parser directory)
 */

import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { parse } from "../src/core/parser";
// @ts-ignore
import { initCoreWasm } from "../src/core/wasm-opt";
// @ts-ignore
import dcmjs from "dcmjs";
// @ts-ignore
import dicomParser from "dicom-parser";
// @ts-ignore
import efferentDicom from "efferent-dicom";

function parseWithDcmjs(data: Uint8Array) {
    const buffer = Buffer.from(
        data.buffer,
        data.byteOffset,
        data.byteLength
    ) as Buffer;
    const dcmjsModule = dcmjs as unknown as {
        data: {
            DicomMessage: {
                readFile: (buffer: Buffer) => {
                    dict?: Record<string, unknown>;
                };
            };
        };
    };
    const message = dcmjsModule.data.DicomMessage.readFile(buffer);
    return { dict: message?.dict ?? {} };
}

function parseWithDicomParser(data: Uint8Array) {
    const dataset = dicomParser.parseDicom(data);
    return { dict: dataset.elements ?? {} };
}

function parseWithEfferentDicom(data: Uint8Array) {
    const reader = new efferentDicom.DicomReader(data);
    const dict = reader.DicomTags ?? {};
    return { dict };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BenchmarkResult {
    parser: string;
    file: string;
    fileSize: number;
    success: boolean;
    parseTime: number;
    elementCount: number;
    error?: string;
}

interface ParserStats {
    parser: string;
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
 * Get memory usage (Node.js only)
 */
function getMemoryUsage(): number {
    if (typeof process !== "undefined" && process.memoryUsage) {
        return process.memoryUsage().heapUsed;
    }
    return 0;
}

/**
 * Benchmark a single parser on a file
 */
function benchmarkParser(
    parserName: string,
    filePath: string,
    fileData: Uint8Array
): BenchmarkResult {
    const startTime = performance.now();
    const startMemory = getMemoryUsage();
    let success = false;
    let elementCount = 0;
    let error: string | undefined;

    try {
        let dataset;
        switch (parserName) {
            case "rad-parser":
                dataset = parse(fileData, { type: "full", enableWasm: false });
                elementCount = Object.keys(dataset.dict || {}).length;
                break;
            case "rad-parser-wasm":
                dataset = parse(fileData, { type: "full", enableWasm: true });
                elementCount = Object.keys(dataset.dict || {}).length;
                break;
            case "rad-parser-fast":
                dataset = parse(fileData, { type: "fast" });
                elementCount = Object.keys(dataset).length;
                break;
            case "rad-parser-shallow":
                dataset = parse(fileData, { type: "shallow" });
                elementCount = Object.keys(dataset).length;
                break;
            case "rad-parser-medium":
                dataset = parse(fileData, { type: "light" });
                elementCount = Object.keys(dataset.dict || {}).length;
                break;
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
                break;
            default:
                throw new Error(`Unknown parser: ${parserName}`);
        }

        success = true;

        // Skip saving large JSON outputs to avoid memory issues
        // Uncomment below if you need to save outputs for debugging
        /*
    if (success) {
      const resultsDir = join(__dirname, 'results', parserName);
      try {
        if (!existsSync(resultsDir)) {
          mkdirSync(resultsDir, { recursive: true });
        }

        const fileName = filePath.split(/[/\\]/).pop() + '.json';
        const outputPath = join(resultsDir, fileName);

        // Custom replacer for BigInt and Binary data
        const replacer = (key: string, value: any) => {
          if (typeof value === 'bigint') {
            return value.toString();
          }
          if (value instanceof Uint8Array || value instanceof ArrayBuffer || (value && value.type === 'Buffer')) {
            return `[Binary data: ${value.byteLength || value.length} bytes]`;
          }
          // Handle potential circular references or specific parser internals
          if (key === 'dataSet' && parserName === 'dicom-parser') return '[Circular]';
          return value;
        };

        writeFileSync(outputPath, JSON.stringify(dataset, replacer, 2));
      } catch (err) {
        console.error(`Failed to save output for ${parserName}:`, err);
      }
    }
    */
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        success = false;
    }

    const endTime = performance.now();
    const parseTime = endTime - startTime;

    return {
        parser: parserName,
        file: filePath,
        fileSize: fileData.length,
        success,
        parseTime,
        elementCount,
        error,
    };
}

/**
 * Collect statistics for a parser
 */
function collectStats(
    results: BenchmarkResult[],
    parserName: string
): ParserStats {
    const parserResults = results.filter(r => r.parser === parserName);
    const successful = parserResults.filter(r => r.success);
    const failed = parserResults.filter(r => !r.success);

    const times = successful.map(r => r.parseTime);
    const totalTime = times.reduce((sum, t) => sum + t, 0);
    const averageTime =
        successful.length > 0 ? totalTime / successful.length : 0;
    const minTime = times.length > 0 ? Math.min(...times) : 0;
    const maxTime = times.length > 0 ? Math.max(...times) : 0;

    const totalElements = successful.reduce(
        (sum, r) => sum + r.elementCount,
        0
    );
    const averageElements =
        successful.length > 0 ? totalElements / successful.length : 0;

    const totalSize = parserResults.reduce((sum, r) => sum + r.fileSize, 0);
    const averageSize =
        parserResults.length > 0 ? totalSize / parserResults.length : 0;

    const errors = failed.map(r => {
        const fileName = r.file.split(/[/\\]/).pop() || r.file;
        return `${fileName}: ${r.error || "Unknown error"}`;
    });

    return {
        parser: parserName,
        totalFiles: parserResults.length,
        successful: successful.length,
        failed: failed.length,
        totalTime,
        averageTime,
        minTime,
        maxTime,
        totalElements,
        averageElements,
        totalSize,
        averageSize,
        errors,
    };
}

/**
 * Format file size
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format time
 */
function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)} μs`;
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Print benchmark results
 */
function printResults(stats: ParserStats[]): void {
    console.log("\n" + "=".repeat(80));
    console.log("DICOM Parser Benchmark Results");
    console.log("=".repeat(80) + "\n");

    // Sort by average time
    const sorted = [...stats].sort((a, b) => a.averageTime - b.averageTime);

    // Summary table
    console.log("Summary:");
    console.log("-".repeat(80));
    console.log(
        `${"Parser".padEnd(20)} ${"Files".padEnd(8)} ${"Success".padEnd(10)} ${"Avg Time".padEnd(12)} ${"Min Time".padEnd(12)} ${"Max Time".padEnd(12)} ${"Avg Elements".padEnd(15)}`
    );
    console.log("-".repeat(80));

    for (const stat of sorted) {
        const successRate = `${stat.successful}/${stat.totalFiles}`;
        console.log(
            `${stat.parser.padEnd(20)} ${stat.totalFiles.toString().padEnd(8)} ${successRate.padEnd(10)} ${formatTime(stat.averageTime).padEnd(12)} ${formatTime(stat.minTime).padEnd(12)} ${formatTime(stat.maxTime).padEnd(12)} ${stat.averageElements.toFixed(0).padEnd(15)}`
        );
    }

    console.log("\n" + "-".repeat(80));
    console.log("Performance Comparison (relative to fastest):");
    console.log("-".repeat(80));

    const fastest = sorted[0];
    for (const stat of sorted) {
        const speedup =
            fastest.averageTime > 0
                ? stat.averageTime / fastest.averageTime
                : 1;
        const bar = "█".repeat(Math.min(50, Math.round(speedup * 10)));
        console.log(
            `${stat.parser.padEnd(20)} ${speedup.toFixed(2)}x ${bar} ${formatTime(stat.averageTime)}`
        );
    }

    // File size statistics
    console.log("\n" + "-".repeat(80));
    console.log("File Size Statistics:");
    console.log("-".repeat(80));
    console.log(
        `${"Parser".padEnd(20)} ${"Total Size".padEnd(15)} ${"Avg Size".padEnd(15)} ${"Files Processed".padEnd(18)}`
    );
    console.log("-".repeat(80));

    for (const stat of sorted) {
        console.log(
            `${stat.parser.padEnd(20)} ${formatBytes(stat.totalSize).padEnd(15)} ${formatBytes(stat.averageSize).padEnd(15)} ${stat.totalFiles.toString().padEnd(18)}`
        );
    }

    // Errors
    const parsersWithErrors = stats.filter(s => s.errors.length > 0);
    if (parsersWithErrors.length > 0) {
        console.log("\n" + "-".repeat(80));
        console.log("Errors:");
        console.log("-".repeat(80));

        for (const stat of parsersWithErrors) {
            console.log(`\n${stat.parser} (${stat.errors.length} errors):`);
            for (const error of stat.errors.slice(0, 5)) {
                console.log(`  - ${error}`);
            }
            if (stat.errors.length > 5) {
                console.log(`  ... and ${stat.errors.length - 5} more errors`);
            }
        }
    }

    console.log("\n" + "=".repeat(80));
}

/**
 * Get all DICOM files recursively from a directory
 */
function getAllDicomFiles(dir: string, fileList: string[] = []): string[] {
    if (!existsSync(dir)) {
        return fileList;
    }

    const files = readdirSync(dir);
    files.forEach(file => {
        const filePath = join(dir, file);
        try {
            const stat = statSync(filePath);
            if (stat.isDirectory()) {
                getAllDicomFiles(filePath, fileList);
            } else if (
                stat.isFile() &&
                stat.size >= 132 &&
                !file.includes("Zone.Identifier")
            ) {
                // Minimum DICOM file size is 132 bytes (preamble + header)
                fileList.push(filePath);
            }
        } catch {
            // Skip files that can't be accessed
        }
    });
    return fileList;
}

/**
 * Main benchmark function
 */
async function runBenchmark(): Promise<void> {
    // Find test_data directory (could be at project root or relative to this file)
    const projectRoot = resolve(__dirname, "../");
    // Try multiple possible paths
    const possiblePaths = [
        join(projectRoot, "test_data/TEST/SOLO"),
        join(projectRoot, "test_data/TEST/SUBF"),
        join(projectRoot, "test_data/REAL/DICOM"),
        join(projectRoot, "test_data/WG04"),
        join(projectRoot, "test_data/pydicom"),
        join(projectRoot, "test_data/patient/DICOM"),
        join(projectRoot, "test_data/21197522-9_20251130013123Examenes/DICOM"),
        join(projectRoot, "test_data/examples"),
    ];

    // Initialize Wasm
    try {
        const wasmPath = join(
            projectRoot,
            "src/wasm-core-build/rad_parser_wasm_core_bg.wasm"
        );
        const wasmBuffer = readFileSync(wasmPath);
        await initCoreWasm(wasmBuffer as any);
        console.log("Wasm initialized for benchmarking");
    } catch (e) {
        console.warn("Failed to initialize Wasm:", e);
    }

    // Collect files from all available directories
    const allFiles: string[] = [];
    for (const testPath of possiblePaths) {
        if (existsSync(testPath)) {
            const files = getAllDicomFiles(testPath);
            allFiles.push(...files);
            console.log(`Found ${files.length} files in ${testPath}`);
        }
    }

    if (allFiles.length === 0) {
        console.error("No DICOM files found. Tried paths:");
        possiblePaths.forEach(p => console.error(`  - ${p}`));
        console.error(
            "Please ensure test_data directory exists with DICOM files"
        );
        process.exit(1);
    }

    const parsers = [
        "rad-parser",
        "rad-parser-wasm",
        "rad-parser-fast",
        "rad-parser-shallow",
        "rad-parser-medium",
        "dcmjs",
        "dicom-parser",
        "efferent-dicom",
    ];
    const maxFiles = 50; // Limit to first 50 files for faster benchmarking

    console.log(`\nLoading DICOM files...`);
    console.log(`Total files found: ${allFiles.length}`);

    // Limit files for benchmarking
    const files = allFiles.slice(0, maxFiles);

    const results: BenchmarkResult[] = [];

    // Run benchmarks
    for (const parser of parsers) {
        if (parser === "rad-parser-wasm") {
            console.log("Initializing Wasm for rad-parser-wasm...");
            try {
                await initCoreWasm();
            } catch (e) {
                console.error("Failed to init Wasm:", e);
            }
        }
        console.log(`Benchmarking ${parser}...`);
        let processed = 0;

        for (const filePath of files) {
            try {
                const fileData = new Uint8Array(readFileSync(filePath));
                const result = benchmarkParser(parser, filePath, fileData);
                results.push(result);
                processed++;

                if (processed % 10 === 0) {
                    process.stdout.write(
                        `  Processed ${processed}/${files.length} files...\r`
                    );
                }
            } catch (error) {
                const fileName = filePath.split(/[/\\]/).pop() || filePath;
                console.error(`\nError reading file ${fileName}:`, error);
            }
        }

        console.log(`  Completed ${processed} files`);
    }

    // Collect statistics
    const stats = parsers.map(parser => collectStats(results, parser));

    // Print results
    printResults(stats);

    // Save detailed results to JSON
    const resultsDir = join(projectRoot, "output", "benchmarks");
    if (!existsSync(resultsDir)) {
        mkdirSync(resultsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = join(resultsDir, `benchmark-summary-${timestamp}.json`);
    writeFileSync(outputPath, JSON.stringify({ stats, results }, null, 2));
    console.log(`\nDetailed results saved to: ${outputPath}`);
}

// Run benchmark
runBenchmark().catch(error => {
    console.error("Benchmark failed:", error);
    process.exit(1);
});
