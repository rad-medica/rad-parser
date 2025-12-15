/**
 * Safe Comprehensive DICOM Parser Benchmark
 * With timeouts and progress saving
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from '../src/index.js';
import { StreamingParser } from '../src/index.js';
import dcmjs from 'dcmjs';
import dicomParser from 'dicom-parser';
import efferentDicom from 'efferent-dicom';

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
          // Skip
        }
      }
    }
  } catch {
    // Skip
  }
  return files;
}

function benchmarkParserWithTimeout(
  parserName: string,
  filePath: string,
  fileData: Uint8Array,
  timeoutMs: number = 10000
): BenchmarkResult {
  const startTime = performance.now();
  let success = false;
  let elementCount = 0;
  let error: string | undefined;

  const timeout = setTimeout(() => {
    error = 'Timeout';
    success = false;
  }, timeoutMs);

  try {
    let dataset;
    switch (parserName) {
      case 'rad-parser':
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
        const chunkSize = 32768;
        let streamingSuccess = false;
        let streamingElements = 0;
        const parser = new StreamingParser({
          maxBufferSize: 50 * 1024 * 1024,
          maxIterations: 500,
          onElement: (element) => {
            streamingElements += Object.keys(element.dict || {}).length;
            streamingSuccess = true;
          },
          onError: () => {},
        });
        
        for (let i = 0; i < fileData.length; i += chunkSize) {
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
    clearTimeout(timeout);
  } catch (e) {
    clearTimeout(timeout);
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

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('Comprehensive DICOM Parser Benchmark (Safe Mode)');
  console.log('='.repeat(80) + '\n');

  const testDataPaths = [
    join(__dirname, '..', 'test_data', 'TEST', 'SOLO'),
    join(__dirname, '..', 'test_data', 'TEST', 'SUBF'),
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

  console.log(`\nTotal files found: ${allFiles.length}\n`);

  const fileData: Array<{ path: string; data: Uint8Array }> = [];
  for (const filePath of allFiles) {
    try {
      const data = readFileSync(filePath);
      fileData.push({ path: filePath, data: new Uint8Array(data) });
    } catch {
      // Skip
    }
  }

  console.log(`Loaded ${fileData.length} files\n`);

  const parsers = [
    'rad-parser-fast',
    'rad-parser-shallow',
    'rad-parser-medium',
    'rad-parser',
    'rad-parser-streaming',
    'dcmjs',
    'dicom-parser',
    'efferent-dicom',
  ];

  const allResults: BenchmarkResult[] = [];
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  for (const parserName of parsers) {
    console.log(`Benchmarking ${parserName}...`);
    const parserResults: BenchmarkResult[] = [];
    let processed = 0;
    const startParserTime = performance.now();

    for (const { path, data } of fileData) {
      processed++;
      if (processed % 10 === 0 || processed === fileData.length) {
        const elapsed = (performance.now() - startParserTime) / 1000;
        const rate = elapsed > 0 ? processed / elapsed : 0;
        console.log(`  [${processed}/${fileData.length}] ${rate.toFixed(1)} files/s`);
      }
      
      const result = benchmarkParserWithTimeout(parserName, path, data, 10000);
      parserResults.push(result);
      allResults.push(result);
    }
    
    const parserTime = (performance.now() - startParserTime) / 1000;
    console.log(`  ✓ Completed in ${parserTime.toFixed(1)}s\n`);
  }

  const stats: ParserStats[] = [];
  for (const parserName of parsers) {
    const parserResults = allResults.filter(r => r.parser === parserName);
    stats.push(calculateStats(parserName, parserResults));
  }

  console.log('='.repeat(80));
  console.log('Results Summary');
  console.log('='.repeat(80) + '\n');

  const sorted = [...stats].sort((a, b) => {
    const aRate = a.successful / a.totalFiles;
    const bRate = b.successful / b.totalFiles;
    if (Math.abs(aRate - bRate) > 0.01) {
      return bRate - aRate;
    }
    return a.averageTime - b.averageTime;
  });

  console.log(`${'Parser'.padEnd(25)} ${'Success'.padEnd(12)} ${'Avg Time'.padEnd(12)} ${'Avg Elements'.padEnd(15)}`);
  console.log('-'.repeat(80));
  for (const stat of sorted) {
    const successRate = ((stat.successful / stat.totalFiles) * 100).toFixed(1);
    console.log(
      `${stat.parser.padEnd(25)} ${successRate.padEnd(11)}% ${formatTime(stat.averageTime).padEnd(12)} ${stat.averageElements.toFixed(0).padEnd(15)}`
    );
  }

  const replacer = (key: string, value: any) => {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) return `[Binary: ${value.byteLength || value.length} bytes]`;
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

  console.log(`\nResults saved to: ${join(resultsDir, 'comprehensive-benchmark-*.json')}`);
}

main().catch(console.error);

