import { readFileSync } from 'fs';
import { join } from 'path';
import { StreamingParser } from '../src/core/streaming';

const testFile = join('test_data', 'WG04', 'J2KI', 'CT1_J2KI');
const data = readFileSync(testFile);

console.log(`File size: ${(data.length / 1024).toFixed(2)} KB\n`);

// Benchmark 1: Single chunk
console.log('Streaming Parser - Single Chunk:');
let elements1 = 0;
const start1 = performance.now();
const parser1 = new StreamingParser({
  onElement: () => { elements1++; }
});
parser1.processChunk(data);
parser1.finalize();
const time1 = performance.now() - start1;
console.log(`  Time: ${time1.toFixed(2)}ms`);
console.log(`  Elements: ${elements1}\n`);

// Benchmark 2: Small chunks (1KB)
console.log('Streaming Parser - 1KB Chunks:');
let elements2 = 0;
const start2 = performance.now();
const parser2 = new StreamingParser({
  onElement: () => { elements2++; }
});
const chunkSize = 1024;
for (let i = 0; i < data.length; i += chunkSize) {
  parser2.processChunk(data.slice(i, Math.min(i + chunkSize, data.length)));
}
parser2.finalize();
const time2 = performance.now() - start2;
console.log(`  Time: ${time2.toFixed(2)}ms`);
console.log(`  Elements: ${elements2}\n`);

// Benchmark 3: Tiny chunks (100 bytes)
console.log('Streaming Parser - 100 byte Chunks:');
let elements3 = 0;
const start3 = performance.now();
const parser3 = new StreamingParser({
  onElement: () => { elements3++; }
});
const tinyChunk = 100;
for (let i = 0; i < data.length; i += tinyChunk) {
  parser3.processChunk(data.slice(i, Math.min(i + tinyChunk, data.length)));
}
parser3.finalize();
const time3 = performance.now() - start3;
console.log(`  Time: ${time3.toFixed(2)}ms`);
console.log(`  Elements: ${elements3}\n`);

// Compare to main parser
console.log('Main Parser (for comparison):');
const { parse } = await import('../src/index.js');
const start4 = performance.now();
const result = parse(data, { type: 'full' });
const time4 = performance.now() - start4;
console.log(`  Time: ${time4.toFixed(2)}ms`);
console.log(`  Elements: ${Object.keys(result.dict).length}\n`);

console.log('Summary:');
console.log(`  Streaming (single chunk): ${time1.toFixed(2)}ms`);
console.log(`  Streaming (1KB chunks): ${time2.toFixed(2)}ms`);
console.log(`  Streaming (100B chunks): ${time3.toFixed(2)}ms`);
console.log(`  Main parser: ${time4.toFixed(2)}ms`);
