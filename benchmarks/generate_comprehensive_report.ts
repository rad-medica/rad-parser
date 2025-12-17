/**
 * Generate Comprehensive Comparison Report (JS vs WASM)
 *
 * Reads results from the comprehensive benchmark and generates
 * a detailed Markdown report comparing JS and WASM versions
 * across different test sets (TEST_STUDY, EDGE_CASES).
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)} μs`;
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

async function main() {
    const resultsDir = join(__dirname, "results");
    const statsPath = join(resultsDir, "comprehensive-benchmark-stats.json");

    if (!existsSync(statsPath)) {
        console.error(
            "Benchmark stats not found. Please run the benchmark first."
        );
        return;
    }

    const stats: ParserStats[] = JSON.parse(readFileSync(statsPath, "utf-8"));
    const testSets = [...new Set(stats.map(s => s.testSet))];

    let report = "# Comprehensive DICOM Parser Comparison Report\n\n";
    report +=
        "This report compares various modes of `rad-parser` (in both pure JavaScript and WASM-accelerated versions) against other popular DICOM parsing libraries across different datasets.\n\n";

    for (const testSet of testSets) {
        const testSetStats = stats.filter(s => s.testSet === testSet);
        const sectionTitle =
            testSet === "TEST_STUDY"
                ? "Standard Study Performance"
                : "Edge Case Reliability & Performance";

        report += `## ${sectionTitle} (${testSet})\n\n`;

        // JS vs WASM Comparison Section for this test set
        const modes = ["fast", "shallow", "medium", "full", "streaming"];
        report += "### JS vs WASM Performance Comparison\n\n";
        report += "| Mode | JS Avg Time | WASM Avg Time | Speedup |\n";
        report += "| :--- | :--- | :--- | :--- |\n";

        for (const mode of modes) {
            const jsName = `rad-${mode}-js`;
            const wasmName = `rad-${mode}-wasm`;
            const jsStat = testSetStats.find(s => s.parser === jsName);
            const wasmStat = testSetStats.find(s => s.parser === wasmName);

            if (jsStat && wasmStat && wasmStat.averageTime > 0) {
                const speedup = jsStat.averageTime / wasmStat.averageTime;
                report += `| ${mode} | ${formatTime(jsStat.averageTime)} | ${formatTime(wasmStat.averageTime)} | **${speedup.toFixed(2)}x** |\n`;
            }
        }
        report += "\n";

        // Summary Table for this test set
        report += "### Benchmark Summary\n\n";
        report +=
            "| Parser | Files | Success % | Avg Time | Min Time | Avg Elements |\n";
        report += "| :--- | :--- | :--- | :--- | :--- | :--- |\n";

        const sortedStats = [...testSetStats].sort((a, b) => {
            const aRate = a.successful / a.totalFiles;
            const bRate = b.successful / b.totalFiles;
            if (Math.abs(aRate - bRate) > 0.01) return bRate - aRate;
            return a.averageTime - b.averageTime;
        });

        for (const s of sortedStats) {
            const rate = ((s.successful / s.totalFiles) * 100).toFixed(1);
            report += `| ${s.parser} | ${s.totalFiles} | ${rate}% | ${formatTime(s.averageTime)} | ${formatTime(s.minTime)} | ${Math.round(s.averageElements)} |\n`;
        }
        report += "\n";
    }

    // Capability Matrix (Updated)
    report += "## Capability Matrix\n\n";
    report +=
        "| Feature | rad-fast | rad-shallow | rad-medium | rad-full | rad-streaming | dcmjs | dicom-parser | effererent-dicom |\n";
    report +=
        "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n";
    report += "| **Core Parsing** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |\n";
    report += "| **WASM Support** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |\n";
    report += "| **Streaming** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |\n";
    report +=
        "| **100% Reliability** | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ |\n";
    report += "| **Pixel Data** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |\n";
    report += "| **Sequences** | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |\n";
    report += "\n";

    // Recommendations
    report += "## Recommendations\n\n";
    report +=
        "1. **For Maximum Speed**: Use `rad-fast-wasm`. It provides the fastest parsing for basic tags.\n";
    report +=
        "2. **For General Use**: Use `rad-full-wasm`. It offers the best balance of features, performance, and 100% reliability.\n";
    report +=
        "3. **For Large Files**: Use `rad-streaming-wasm` to process files in chunks without loading everything into memory.\n";
    report +=
        "4. **For Compatibility**: `rad-full` provides the most comprehensive dataset compatible with other libraries.\n";

    const reportPath = join(
        dirname(__dirname),
        "COMPREHENSIVE_COMPARISON_REPORT.md"
    );
    writeFileSync(reportPath, report);
    console.log(`Report generated successfully: ${reportPath}`);
}

main().catch(console.error);
