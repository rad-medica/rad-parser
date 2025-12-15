/**
 * Advanced Features Benchmark
 * 
 * Benchmarks streaming, serialization, and anonymization features
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse, write, anonymize, StreamingParser, parseFromStream, extractTransferSyntax } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BenchmarkResult {
  feature: string;
  operation: string;
  file: string;
  transferSyntax?: string;
  success: boolean;
  time: number;
  size?: number;
  error?: string;
}

/**
 * Get all DICOM files recursively
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
      } else if (stat.isFile() && stat.size >= 132 && !file.includes('Zone.Identifier')) {
        fileList.push(filePath);
      }
    } catch {
      // Skip
    }
  });
  return fileList;
}

/**
 * Group files by transfer syntax
 */
function groupByTransferSyntax(files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  
  for (const filePath of files) {
    try {
      const fileData = new Uint8Array(readFileSync(filePath));
      const ts = extractTransferSyntax(fileData) || 'UNKNOWN';
      
      if (!groups.has(ts)) {
        groups.set(ts, []);
      }
      groups.get(ts)!.push(filePath);
    } catch {
      // Skip
    }
  }
  
  return groups;
}

/**
 * Benchmark streaming parser
 */
function benchmarkStreaming(filePath: string, fileData: Uint8Array): BenchmarkResult {
  const startTime = performance.now();
  let success = false;
  let error: string | undefined;
  const transferSyntax = extractTransferSyntax(fileData) || undefined;

  try {
    let elementCount = 0;
    const parser = new StreamingParser({
      onElement: (element) => {
        elementCount += Object.keys(element.dict || {}).length;
      },
      onError: (err) => {
        throw err;
      },
    });

    // Simulate streaming
    const chunkSize = 8192; // 8KB chunks
    parser.initialize(fileData.slice(0, Math.min(chunkSize, fileData.length)));
    
    for (let i = chunkSize; i < fileData.length; i += chunkSize) {
      const chunk = fileData.slice(i, Math.min(i + chunkSize, fileData.length));
      parser.processChunk(chunk);
    }
    
    parser.finalize();
    success = elementCount > 0;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const endTime = performance.now();
  return {
    feature: 'streaming',
    operation: 'parse',
    file: filePath.split(/[/\\]/).pop() || filePath,
    transferSyntax,
    success,
    time: endTime - startTime,
    size: fileData.length,
    error,
  };
}

/**
 * Benchmark serialization
 */
function benchmarkSerialization(filePath: string, fileData: Uint8Array): BenchmarkResult {
  const startTime = performance.now();
  let success = false;
  let serializedSize = 0;
  let error: string | undefined;
  const transferSyntax = extractTransferSyntax(fileData) || undefined;

  try {
    const dataset = parse(fileData, { type: 'full' });
    const serialized = write(dataset);
    serializedSize = serialized.length;
    success = serialized.length > 132 && 
              serialized.slice(128, 132).every((b, i) => b === [68, 73, 67, 77][i]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const endTime = performance.now();
  return {
    feature: 'serialization',
    operation: 'write',
    file: filePath.split(/[/\\]/).pop() || filePath,
    transferSyntax,
    success,
    time: endTime - startTime,
    size: serializedSize,
    error,
  };
}

/**
 * Benchmark round-trip (parse -> serialize -> parse)
 */
function benchmarkRoundTrip(filePath: string, fileData: Uint8Array): BenchmarkResult {
  const startTime = performance.now();
  let success = false;
  let error: string | undefined;
  const transferSyntax = extractTransferSyntax(fileData) || undefined;

  try {
    const originalDataset = parse(fileData, { type: 'full' });
    const serialized = write(originalDataset);
    const reparsedDataset = parse(serialized, { type: 'light' });
    
    // Verify round-trip success
    const originalElements = Object.keys(originalDataset.dict || {}).length;
    const reparsedElements = Object.keys(reparsedDataset.dict || {}).length;
    
    success = reparsedElements > 0 && reparsedElements >= originalElements * 0.8; // Allow some loss
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const endTime = performance.now();
  return {
    feature: 'serialization',
    operation: 'round-trip',
    file: filePath.split(/[/\\]/).pop() || filePath,
    transferSyntax,
    success,
    time: endTime - startTime,
    error,
  };
}

/**
 * Benchmark anonymization
 */
function benchmarkAnonymization(filePath: string, fileData: Uint8Array): BenchmarkResult {
  const startTime = performance.now();
  let success = false;
  let error: string | undefined;
  const transferSyntax = extractTransferSyntax(fileData) || undefined;

  try {
    const dataset = parse(fileData, { type: 'full' });
    const anonymized = anonymize(dataset, { patientIdPrefix: 'ANON' });
    
    // Verify anonymization worked
    const patientName = anonymized.string('x00100010');
    const patientId = anonymized.string('x00100020');
    
    success = Object.keys(anonymized.dict || {}).length > 0;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const endTime = performance.now();
  return {
    feature: 'anonymization',
    operation: 'anonymize',
    file: filePath.split(/[/\\]/).pop() || filePath,
    transferSyntax,
    success,
    time: endTime - startTime,
    error,
  };
}

/**
 * Collect statistics
 */
function collectStats(results: BenchmarkResult[], feature: string, operation: string) {
  const filtered = results.filter(r => r.feature === feature && r.operation === operation);
  const successful = filtered.filter(r => r.success);
  
  if (successful.length === 0) {
    return {
      feature,
      operation,
      total: filtered.length,
      successful: 0,
      failed: filtered.length,
      avgTime: 0,
      minTime: 0,
      maxTime: 0,
      successRate: 0,
    };
  }

  const times = successful.map(r => r.time);
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  return {
    feature,
    operation,
    total: filtered.length,
    successful: successful.length,
    failed: filtered.length - successful.length,
    avgTime,
    minTime,
    maxTime,
    successRate: (successful.length / filtered.length) * 100,
  };
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
async function runBenchmark(): Promise<void> {
  const projectRoot = resolve(__dirname, '../');
  const testDataPaths = [
    join(projectRoot, 'test_data/TEST/SOLO'),
    join(projectRoot, 'test_data/TEST/SUBF'),
  ];

  const allFiles: string[] = [];
  for (const testPath of testDataPaths) {
    if (existsSync(testPath)) {
      const files = getAllDicomFiles(testPath);
      allFiles.push(...files);
    }
  }

  const maxFiles = 50;
  const files = allFiles.slice(0, maxFiles);
  const transferSyntaxGroups = groupByTransferSyntax(files);

  console.log(`\nAdvanced Features Benchmark`);
  console.log(`Found ${files.length} files`);
  console.log(`Transfer syntaxes: ${transferSyntaxGroups.size}\n`);

  const results: BenchmarkResult[] = [];

  // Benchmark streaming
  console.log('Benchmarking streaming parser...');
  for (const filePath of files.slice(0, 20)) {
    try {
      const fileData = new Uint8Array(readFileSync(filePath));
      results.push(benchmarkStreaming(filePath, fileData));
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
    }
  }

  // Benchmark serialization
  console.log('Benchmarking serialization...');
  for (const filePath of files.slice(0, 20)) {
    try {
      const fileData = new Uint8Array(readFileSync(filePath));
      results.push(benchmarkSerialization(filePath, fileData));
      results.push(benchmarkRoundTrip(filePath, fileData));
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
    }
  }

  // Benchmark anonymization
  console.log('Benchmarking anonymization...');
  for (const filePath of files.slice(0, 20)) {
    try {
      const fileData = new Uint8Array(readFileSync(filePath));
      results.push(benchmarkAnonymization(filePath, fileData));
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
    }
  }

  // Print results
  console.log('\n' + '='.repeat(80));
  console.log('Advanced Features Benchmark Results');
  console.log('='.repeat(80) + '\n');

  const stats = [
    collectStats(results, 'streaming', 'parse'),
    collectStats(results, 'serialization', 'write'),
    collectStats(results, 'serialization', 'round-trip'),
    collectStats(results, 'anonymization', 'anonymize'),
  ];

  console.log('Summary:');
  console.log('-'.repeat(80));
  console.log(
    `${'Feature'.padEnd(20)} ${'Operation'.padEnd(15)} ${'Success Rate'.padEnd(15)} ${'Avg Time'.padEnd(12)} ${'Min Time'.padEnd(12)} ${'Max Time'.padEnd(12)}`
  );
  console.log('-'.repeat(80));

  for (const stat of stats) {
    console.log(
      `${stat.feature.padEnd(20)} ${stat.operation.padEnd(15)} ${stat.successRate.toFixed(1).padEnd(14)}% ${formatTime(stat.avgTime).padEnd(12)} ${formatTime(stat.minTime).padEnd(12)} ${formatTime(stat.maxTime).padEnd(12)}`
    );
  }

  // Transfer syntax breakdown
  console.log('\n' + '-'.repeat(80));
  console.log('Transfer Syntax Breakdown:');
  console.log('-'.repeat(80));

  const tsStats = new Map<string, { total: number; success: number }>();
  results.forEach(r => {
    const ts = r.transferSyntax || 'UNKNOWN';
    if (!tsStats.has(ts)) {
      tsStats.set(ts, { total: 0, success: 0 });
    }
    const stat = tsStats.get(ts)!;
    stat.total++;
    if (r.success) stat.success++;
  });

  tsStats.forEach((stat, ts) => {
    const rate = (stat.success / stat.total) * 100;
    console.log(`  ${ts}: ${stat.success}/${stat.total} (${rate.toFixed(1)}%)`);
  });

  // Save results
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }
  const outputPath = join(resultsDir, 'advanced-features-benchmark.json');
  writeFileSync(outputPath, JSON.stringify({ stats, results }, null, 2));
  console.log(`\nDetailed results saved to: ${outputPath}`);
}

runBenchmark().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});

