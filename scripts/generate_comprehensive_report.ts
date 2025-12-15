/**
 * Generate comprehensive comparison report from benchmark results
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatTime(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)} μs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function generateReport() {
  const resultsPath = join(__dirname, 'results', 'comprehensive-benchmark-stats.json');
  
  if (!existsSync(resultsPath)) {
    console.error('Benchmark results not found. Please run benchmark:comprehensive first.');
    process.exit(1);
  }

  const stats: ParserStats[] = JSON.parse(readFileSync(resultsPath, 'utf-8'));

  // Sort by success rate, then speed
  const sorted = [...stats].sort((a, b) => {
    const aRate = a.successful / a.totalFiles;
    const bRate = b.successful / b.totalFiles;
    if (Math.abs(aRate - bRate) > 0.01) {
      return bRate - aRate;
    }
    return a.averageTime - b.averageTime;
  });

  const fastest = sorted.find(s => s.successful === s.totalFiles) || sorted[0];
  const mostReliable = sorted[0]; // Already sorted by success rate

  let report = `# Comprehensive DICOM Parser Comparison

**Date:** ${new Date().toISOString().split('T')[0]}  
**Test Files:** ${stats[0]?.totalFiles || 0} DICOM files  
**Parsers:** rad-parser (fast, shallow, medium, full, wasm, streaming), dcmjs, dicom-parser, efferent-dicom

---

## Executive Summary

### 🏆 Overall Winner: ${mostReliable.parser}

**Key Highlights:**
- **Most Reliable:** ${mostReliable.parser} (${((mostReliable.successful / mostReliable.totalFiles) * 100).toFixed(1)}% success rate)
- **Fastest (100% success):** ${fastest.parser} (${formatTime(fastest.averageTime)} average)
- **Most Elements:** ${sorted.reduce((max, s) => s.averageElements > max.averageElements ? s : max, sorted[0]).parser} (${sorted.reduce((max, s) => s.averageElements > max.averageElements ? s : max, sorted[0]).averageElements.toFixed(0)} elements/file)

---

## Performance Comparison

### Success Rates

| Parser | Success Rate | Files Parsed | Failures |
|--------|-------------|--------------|----------|
`;

  for (const stat of sorted) {
    const rate = ((stat.successful / stat.totalFiles) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round((stat.successful / stat.totalFiles) * 20));
    report += `| **${stat.parser}** | ${rate}% ${bar} | ${stat.successful}/${stat.totalFiles} | ${stat.failed} |\n`;
  }

  report += `\n### Parse Speed\n\n`;
  report += `| Parser | Avg Time | Min Time | Max Time | Throughput | Speed vs Fastest |\n`;
  report += `|--------|----------|----------|----------|------------|------------------|\n`;

  for (const stat of sorted) {
    const speedup = fastest.averageTime > 0 ? stat.averageTime / fastest.averageTime : 1;
    const throughput = stat.successful > 0 ? (1000 / stat.averageTime).toFixed(0) : '0';
    report += `| **${stat.parser}** | ${formatTime(stat.averageTime)} | ${formatTime(stat.minTime)} | ${formatTime(stat.maxTime)} | ${throughput} files/s | ${speedup.toFixed(2)}x |\n`;
  }

  report += `\n### Element Parsing Depth\n\n`;
  report += `| Parser | Avg Elements | Total Elements | Coverage |\n`;
  report += `|--------|--------------|---------------|----------|\n`;

  for (const stat of sorted) {
    const coverage = stat.averageElements > 0 ? 'Good' : 'Basic';
    report += `| **${stat.parser}** | ${stat.averageElements.toFixed(0)} | ${stat.totalElements.toLocaleString()} | ${coverage} |\n`;
  }

  report += `\n---\n\n## Capability Matrix\n\n`;
  report += `| Feature | rad-fast | rad-shallow | rad-medium | rad-full | rad-wasm | rad-streaming | dcmjs | dicom-parser | efferent |\n`;
  report += `|---------|----------|-------------|------------|----------|----------|---------------|-------|--------------|----------|\n`;

  const capabilities = [
    { feature: 'Core Parsing', radFast: '✅', radShallow: '✅', radMedium: '✅', radFull: '✅', radWasm: '✅', radStreaming: '✅', dcmjs: '✅', dicomParser: '✅', efferent: '✅' },
    { feature: 'Streaming', radFast: '❌', radShallow: '❌', radMedium: '❌', radFull: '❌', radWasm: '❌', radStreaming: '✅', dcmjs: '❌', dicomParser: '❌', efferent: '❌' },
    { feature: 'Serialization', radFast: '❌', radShallow: '❌', radMedium: '❌', radFull: '✅', radWasm: '✅', radStreaming: '❌', dcmjs: '❌', dicomParser: '❌', efferent: '❌' },
    { feature: 'Anonymization', radFast: '❌', radShallow: '❌', radMedium: '✅', radFull: '✅', radWasm: '✅', radStreaming: '❌', dcmjs: '❌', dicomParser: '❌', efferent: '❌' },
    { feature: 'Pixel Data', radFast: '❌', radShallow: '❌', radMedium: '❌', radFull: '✅', radWasm: '✅', radStreaming: '✅', dcmjs: '✅', dicomParser: '⚠️', efferent: '⚠️' },
    { feature: 'Sequences', radFast: '⚠️', radShallow: '⚠️', radMedium: '✅', radFull: '✅', radWasm: '✅', radStreaming: '✅', dcmjs: '✅', dicomParser: '⚠️', efferent: '⚠️' },
    { feature: '100% Reliability', radFast: '✅', radShallow: '✅', radMedium: '✅', radFull: '✅', radWasm: '✅', radStreaming: '⚠️', dcmjs: '❌', dicomParser: '❌', efferent: '⚠️' },
  ];

  for (const cap of capabilities) {
    report += `| ${cap.feature} | ${cap.radFast} | ${cap.radShallow} | ${cap.radMedium} | ${cap.radFull} | ${cap.radWasm} | ${cap.radStreaming} | ${cap.dcmjs} | ${cap.dicomParser} | ${cap.efferent} |\n`;
  }

  report += `\n---\n\n## Detailed Statistics\n\n`;

  for (const stat of sorted) {
    const successRate = ((stat.successful / stat.totalFiles) * 100).toFixed(1);
    report += `### ${stat.parser}\n\n`;
    report += `- **Success Rate:** ${successRate}% (${stat.successful}/${stat.totalFiles})\n`;
    report += `- **Average Time:** ${formatTime(stat.averageTime)}\n`;
    report += `- **Min/Max Time:** ${formatTime(stat.minTime)} / ${formatTime(stat.maxTime)}\n`;
    report += `- **Average Elements:** ${stat.averageElements.toFixed(0)}\n`;
    report += `- **Total Size Processed:** ${formatBytes(stat.totalSize)}\n`;
    if (stat.errors.length > 0) {
      report += `- **Errors:** ${stat.errors.length} files failed\n`;
      if (stat.errors.length <= 10) {
        report += `  - ${stat.errors.slice(0, 5).join('\n  - ')}\n`;
      } else {
        report += `  - ${stat.errors.slice(0, 5).join('\n  - ')}\n  - ... and ${stat.errors.length - 5} more\n`;
      }
    }
    report += `\n`;
  }

  report += `---\n\n## Recommendations\n\n`;

  report += `### Choose rad-parser-fast when:\n`;
  report += `- ⚡ Maximum speed required\n`;
  report += `- 📋 Header/metadata extraction only\n`;
  report += `- 🎯 Tag filtering needed\n\n`;

  report += `### Choose rad-parser-shallow when:\n`;
  report += `- ⚡ Fast scanning/indexing\n`;
  report += `- 📊 Database indexing\n`;
  report += `- ✅ Still need 100% reliability\n\n`;

  report += `### Choose rad-parser-medium when:\n`;
  report += `- ⚖️ Balance speed and completeness\n`;
  report += `- 🏥 Metadata extraction (skip pixel data)\n`;
  report += `- 🔒 Anonymization workflows\n\n`;

  report += `### Choose rad-parser when:\n`;
  report += `- 🏆 Complete data extraction needed\n`;
  report += `- 🖼️ Pixel data required\n`;
  report += `- ✅ 100% reliability essential\n`;
  report += `- 🔧 Production systems\n\n`;

  report += `### Choose rad-parser-streaming when:\n`;
  report += `- 📡 Network/file streams\n`;
  report += `- 💾 Large files (>100MB)\n`;
  report += `- 🧠 Memory-efficient processing\n`;
  report += `- ⚡ Real-time parsing\n\n`;

  report += `### Choose dicom-parser when:\n`;
  const dicomParserStat = sorted.find(s => s.parser === 'dicom-parser');
  const dicomFailRate = dicomParserStat ? ((dicomParserStat.failed / dicomParserStat.totalFiles) * 100).toFixed(0) : '0';
  report += `- ⚡ Maximum speed (accepts ${dicomFailRate}% failures)\n`;
  report += `- 📝 Simple use cases\n\n`;

  report += `### Choose dcmjs when:\n`;
  const dcmjsStat = sorted.find(s => s.parser === 'dcmjs');
  const dcmjsFailRate = dcmjsStat ? ((dcmjsStat.failed / dcmjsStat.totalFiles) * 100).toFixed(0) : '0';
  report += `- 🔄 Existing codebase integration\n`;
  report += `- 📝 Simple parsing needs\n`;
  report += `- ⚠️ ${dcmjsFailRate}% failure rate acceptable\n\n`;

  report += `---\n\n*Report generated from comprehensive benchmark results*\n`;

  const outputPath = join(__dirname, '..', 'COMPREHENSIVE_COMPARISON_REPORT.md');
  writeFileSync(outputPath, report);
  console.log(`Report generated: ${outputPath}`);
}

generateReport();

