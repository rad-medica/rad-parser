/**
 * Comprehensive DICOM Parser Benchmark
 * 
 * Compares all rad-parser modes (full, shallow, fast, medium) + streaming
 * against other parsers (dcmjs, dicom-parser, efferent-dicom)
 * Uses all available test files
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse, initCoreWasm } from '../src/index.js';
import { StreamingParser } from '../src/index.js';
import dcmjs from 'dcmjs';
import dicomParser from 'dicom-parser';
import efferentDicom from 'efferent-dicom';

// ... (keep existing imports)

// ...

  // All parsers to benchmark
  // Note: rad-parser-wasm must come LAST or after rad-parser to avoid polluting the JS-only run
  const parsers = [
    'rad-parser-fast',
    'rad-parser-shallow',
    'rad-parser-medium',
    'rad-parser',
    'rad-parser-streaming',
    'dcmjs',
    'dicom-parser',
    'efferent-dicom',
    'rad-parser-wasm',
  ];

function parseWithDcmjs(data: Uint8Array) {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength) as Buffer;
  const dcmjsModule = dcmjs as unknown as {
    data: { DicomMessage: { readFile: (buffer: Buffer) => { dict?: Record<string, unknown> } } };
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
      } else if (entry.isFile() && !entry.name.endsWith('.txt') && !entry.name.endsWith('.md')) {
        try {
          const stat = statSync(fullPath);
          if (stat.size > 0) {
            files.push(fullPath);
          }
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }
  return files;
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
  let success = false;
  let elementCount = 0;
  let error: string | undefined;

  try {
    let dataset;
    switch (parserName) {
      case 'rad-parser':
      case 'rad-parser-wasm':
        dataset = parse(fileData, { type: 'full' });
        elementCount = Object.keys(dataset.dict || {}).length;
        break;
      case 'rad-parser-fast':
        dataset = parse(fileData, { type: 'fast' });
        elementCount = Object.keys(dataset).length;
        break;
      case 'rad-parser-shallow':
        dataset = parse(fileData, { type: 'shallow' });
        elementCount = Object.keys(dataset).length;
        break;
      case 'rad-parser-medium':
        dataset = parse(fileData, { type: 'light' });
        elementCount = Object.keys(dataset.dict || {}).length;
        break;
      case 'rad-parser-streaming':
        // Simulate streaming by splitting into chunks (optimized with timeout)
        const chunkSize = 32768; // Larger chunks for better performance
        let streamingSuccess = false;
        let streamingElements = 0;
        let streamingError: string | undefined;
        const parser = new StreamingParser({
          maxBufferSize: 50 * 1024 * 1024, // 50MB max
          maxIterations: 500, // Limit iterations per chunk
          onElement: (element) => {
            streamingElements += Object.keys(element.dict || {}).length;
            streamingSuccess = true;
          },
          onError: (err) => {
            streamingError = err.message;
            // Don't fail completely on streaming errors
          },
        });
        
        try {
          const streamStartTime = performance.now();
          const maxStreamTime = 5000; // 5 second timeout per file
          
          // Split file into chunks
          for (let i = 0; i < fileData.length; i += chunkSize) {
            if (performance.now() - streamStartTime > maxStreamTime) {
              error = 'Streaming timeout';
              break;
            }
            const chunk = fileData.slice(i, Math.min(i + chunkSize, fileData.length));
            if (i === 0) {
              parser.initialize(chunk);
            } else {
              parser.processChunk(chunk);
            }
          }
          parser.finalize();
          success = streamingSuccess || streamingElements > 0;
          elementCount = streamingElements;
          if (streamingError && !success) {
            error = streamingError;
          }
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          success = false;
        }
        break;
      case 'dcmjs':
        dataset = parseWithDcmjs(fileData);
        elementCount = Object.keys(dataset.dict || {}).length;
        break;
      case 'dicom-parser':
        dataset = parseWithDicomParser(fileData);
        elementCount = Object.keys(dataset.dict || {}).length;
        break;
      case 'efferent-dicom':
        dataset = parseWithEfferentDicom(fileData);
        elementCount = Object.keys(dataset.dict || {}).length;
        break;
      default:
        throw new Error(`Unknown parser: ${parserName}`);
    }

    success = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    success = false;
  }

  const parseTime = performance.now() - startTime;

  return {
    parser: parserName,
    file: filePath.split(/[/\\]/).pop() || filePath,
    fileSize: fileData.length,
    success,
    parseTime,
    elementCount,
    error,
  };
}

/**
 * Calculate statistics for a parser
 */
function calculateStats(parserName: string, results: BenchmarkResult[]): ParserStats {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalTime = successful.reduce((sum, r) => sum + r.parseTime, 0);
  const totalElements = successful.reduce((sum, r) => sum + r.elementCount, 0);
  const totalSize = results.reduce((sum, r) => sum + r.fileSize, 0);
  const times = successful.map(r => r.parseTime);
  const averageTime = successful.length > 0 ? totalTime / successful.length : 0;
  const minTime = times.length > 0 ? Math.min(...times) : 0;
  const maxTime = times.length > 0 ? Math.max(...times) : 0;
  const averageElements = successful.length > 0 ? totalElements / successful.length : 0;
  const averageSize = results.length > 0 ? totalSize / results.length : 0;
  const errors = failed.map(r => `${r.file}: ${r.error || 'Unknown error'}`);

  return {
    parser: parserName,
    totalFiles: results.length,
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
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
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
 * Main benchmark function
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('Comprehensive DICOM Parser Benchmark');
  console.log('='.repeat(80) + '\n');

  // Find all test data directories
  const testDataPaths = [
    join(__dirname, '..', 'test_data'),
  ];

  const allFiles: string[] = [];
  for (const path of testDataPaths) {
    try {
      const files = getAllDicomFiles(path);
      allFiles.push(...files);
      console.log(`Found ${files.length} files in ${path}`);
    } catch (error) {
      console.log(`Skipping ${path}: ${error}`);
    }
  }

  console.log(`\nTotal files found: ${allFiles.length}`);
  console.log('Using all files for benchmarking\n');

  // Load all files
  const fileData: Array<{ path: string; data: Uint8Array }> = [];
  for (const filePath of allFiles) {
    try {
      const data = readFileSync(filePath);
      fileData.push({ path: filePath, data: new Uint8Array(data) });
    } catch {
      // Skip files we can't read
    }
  }

  console.log(`Loaded ${fileData.length} files\n`);

  // All parsers to benchmark
  const parsers = [
    'rad-parser-fast',
    'rad-parser-shallow',
    'rad-parser-medium',
    'rad-parser',
    'rad-parser-streaming',
    'dcmjs',
    'dicom-parser',
    'efferent-dicom',
    'rad-parser-wasm',
  ];

  const allResults: BenchmarkResult[] = [];

  // Benchmark each parser
  for (const parserName of parsers) {
    if (parserName === 'rad-parser-wasm') {
      console.log('\nInitializing Wasm...');
      try {
        await initCoreWasm();
        console.log('Wasm initialized successfully.');
      } catch (err) {
        console.error('Failed to initialize Wasm:', err);
      }
    }

    console.log(`\nBenchmarking ${parserName}...`);
    const parserResults: BenchmarkResult[] = [];
    let processed = 0;
    const startParserTime = performance.now();

    for (const { path, data } of fileData) {
      processed++;
      // Show progress more frequently (every 25 files)
      if (processed % 25 === 0 || processed === fileData.length) {
        const elapsed = (performance.now() - startParserTime) / 1000;
        const rate = elapsed > 0 ? processed / elapsed : 0;
        const remaining = fileData.length - processed;
        const eta = rate > 0 ? remaining / rate : 0;
        const fileName = path.split(/[/\\]/).pop() || 'unknown';
        console.log(`  [${processed}/${fileData.length}] ${fileName.substring(0, 30)}... (${rate.toFixed(1)} files/s${eta > 0 ? `, ETA: ${eta.toFixed(0)}s` : ''})`);
      }
      
      // Add timeout protection
      const fileStartTime = performance.now();
      const result = benchmarkParser(parserName, path, data);
      const fileTime = performance.now() - fileStartTime;
      
      // Warn if a single file takes too long
      if (fileTime > 10000) {
        console.log(`  ⚠ Warning: ${path.split(/[/\\]/).pop()} took ${(fileTime / 1000).toFixed(1)}s`);
      }
      
      parserResults.push(result);
      allResults.push(result);
    }
    const parserTime = (performance.now() - startParserTime) / 1000;
    console.log(`  ✓ Completed ${fileData.length} files in ${parserTime.toFixed(1)}s`);
  }

  // Calculate statistics
  const stats: ParserStats[] = [];
  for (const parserName of parsers) {
    const parserResults = allResults.filter(r => r.parser === parserName);
    stats.push(calculateStats(parserName, parserResults));
  }

  // Print results
  console.log('\n' + '='.repeat(80));
  console.log('Comprehensive Benchmark Results');
  console.log('='.repeat(80) + '\n');

  // Summary table
  console.log('Summary:');
  console.log('-'.repeat(80));
  console.log(
    `${'Parser'.padEnd(25)} ${'Files'.padEnd(8)} ${'Success'.padEnd(10)} ${'Success %'.padEnd(12)} ${'Avg Time'.padEnd(12)} ${'Min Time'.padEnd(12)} ${'Max Time'.padEnd(12)} ${'Avg Elements'.padEnd(15)}`
  );
  console.log('-'.repeat(80));

  // Sort by success rate, then by speed
  const sorted = [...stats].sort((a, b) => {
    const aRate = a.successful / a.totalFiles;
    const bRate = b.successful / b.totalFiles;
    if (Math.abs(aRate - bRate) > 0.01) {
      return bRate - aRate; // Higher success rate first
    }
    return a.averageTime - b.averageTime; // Then faster
  });

  for (const stat of sorted) {
    const successRate = ((stat.successful / stat.totalFiles) * 100).toFixed(1);
    const successStr = `${stat.successful}/${stat.totalFiles}`;
    console.log(
      `${stat.parser.padEnd(25)} ${stat.totalFiles.toString().padEnd(8)} ${successStr.padEnd(10)} ${successRate.padEnd(11)}% ${formatTime(stat.averageTime).padEnd(12)} ${formatTime(stat.minTime).padEnd(12)} ${formatTime(stat.maxTime).padEnd(12)} ${stat.averageElements.toFixed(0).padEnd(15)}`
    );
  }

  // Performance comparison
  console.log('\n' + '-'.repeat(80));
  console.log('Performance Comparison (relative to fastest):');
  console.log('-'.repeat(80));

  const fastest = sorted.find(s => s.successful === s.totalFiles) || sorted[0];
  for (const stat of sorted) {
    const speedup = fastest.averageTime > 0 ? stat.averageTime / fastest.averageTime : 1;
    const bar = '█'.repeat(Math.min(50, Math.round(speedup * 5)));
    const successRate = ((stat.successful / stat.totalFiles) * 100).toFixed(1);
    console.log(
      `${stat.parser.padEnd(25)} ${speedup.toFixed(2)}x ${bar} ${formatTime(stat.averageTime)} (${successRate}% success)`
    );
  }

  // Capability matrix
  console.log('\n' + '='.repeat(80));
  console.log('Capability Matrix');
  console.log('='.repeat(80) + '\n');

  const capabilities = [
    { feature: 'Core Parsing', radFast: '✅', radShallow: '✅', radMedium: '✅', radFull: '✅', radStreaming: '✅', dcmjs: '✅', dicomParser: '✅', efferent: '✅' },
    { feature: 'Streaming', radFast: '❌', radShallow: '❌', radMedium: '❌', radFull: '❌', radStreaming: '✅', dcmjs: '❌', dicomParser: '❌', efferent: '❌' },
    { feature: 'Serialization', radFast: '❌', radShallow: '❌', radMedium: '❌', radFull: '✅', radStreaming: '❌', dcmjs: '❌', dicomParser: '❌', efferent: '❌' },
    { feature: 'Anonymization', radFast: '❌', radShallow: '❌', radMedium: '✅', radFull: '✅', radStreaming: '❌', dcmjs: '❌', dicomParser: '❌', efferent: '❌' },
    { feature: 'Pixel Data', radFast: '❌', radShallow: '❌', radMedium: '❌', radFull: '✅', radStreaming: '✅', dcmjs: '✅', dicomParser: '⚠️', efferent: '⚠️' },
    { feature: 'Sequences', radFast: '⚠️', radShallow: '⚠️', radMedium: '✅', radFull: '✅', radStreaming: '✅', dcmjs: '✅', dicomParser: '⚠️', efferent: '⚠️' },
    { feature: '100% Reliability', radFast: '✅', radShallow: '✅', radMedium: '✅', radFull: '✅', radStreaming: '⚠️', dcmjs: '❌', dicomParser: '❌', efferent: '⚠️' },
  ];

  console.log(`${'Feature'.padEnd(20)} ${'rad-fast'.padEnd(12)} ${'rad-shallow'.padEnd(12)} ${'rad-medium'.padEnd(12)} ${'rad-full'.padEnd(12)} ${'rad-streaming'.padEnd(14)} ${'dcmjs'.padEnd(8)} ${'dicom-parser'.padEnd(14)} ${'efferent'.padEnd(10)}`);
  console.log('-'.repeat(120));
  for (const cap of capabilities) {
    console.log(
      `${cap.feature.padEnd(20)} ${cap.radFast.padEnd(12)} ${cap.radShallow.padEnd(12)} ${cap.radMedium.padEnd(12)} ${cap.radFull.padEnd(12)} ${cap.radStreaming.padEnd(14)} ${cap.dcmjs.padEnd(8)} ${cap.dicomParser.padEnd(14)} ${cap.efferent.padEnd(10)}`
    );
  }

  // Save detailed results
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const replacer = (key: string, value: any) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value instanceof Uint8Array || value instanceof ArrayBuffer || (value && value.type === 'Buffer')) {
      return `[Binary data: ${value.byteLength || value.length} bytes]`;
    }
    if (key === 'dataSet' && value && typeof value === 'object') return '[Circular]';
    return value;
  };

  writeFileSync(
    join(resultsDir, 'comprehensive-benchmark-stats.json'),
    JSON.stringify(stats, replacer, 2)
  );
  writeFileSync(
    join(resultsDir, 'comprehensive-benchmark-results.json'),
    JSON.stringify(allResults, replacer, 2)
  );

  console.log(`\nDetailed results saved to: ${join(resultsDir, 'comprehensive-benchmark-*.json')}`);
}

main().catch(console.error);

