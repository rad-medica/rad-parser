/**
 * Parse-time comparison with dicom-parser over a directory of DICOM files.
 *
 *   npx tsx benchmarks/synthetic_compare.ts <dir> [rounds]
 *
 * Files are read into memory first; each round parses every file once per
 * parser. Reports the median round time per parser/mode.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import dicomParser from 'dicom-parser';
import { parse } from '../src/index';

const dir = process.argv[2];
const rounds = Number(process.argv[3] ?? 15);
if (!dir) {
  console.error('usage: synthetic_compare.ts <dir> [rounds]');
  process.exit(1);
}

function listFiles(d: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(d).sort()) {
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) out.push(...listFiles(p));
    else if (!/\.(md|json|txt|png|jpg)$/i.test(name)) out.push(p);
  }
  return out;
}

const inflater = (arr: Uint8Array, pos: number) => {
  const inflated = zlib.inflateRawSync(arr.subarray(pos));
  const full = new Uint8Array(pos + inflated.length);
  full.set(arr.subarray(0, pos));
  full.set(inflated, pos);
  return full;
};

const files = listFiles(dir)
  .map(f => new Uint8Array(fs.readFileSync(f)))
  .filter(b => {
    try {
      dicomParser.parseDicom(b, { inflater });
      return true;
    } catch {
      return false;
    }
  });

const runners: Record<string, (b: Uint8Array) => unknown> = {
  'dicom-parser parseDicom': b => dicomParser.parseDicom(b, { inflater }),
  'rad-parser full (pixel views)': b => parse(b, { type: 'full' }),
  'rad-parser full (pixel copy)': b => parse(b, { type: 'full', pixelData: 'copy' }),
  'rad-parser light (no pixel values)': b => parse(b, { type: 'light' }),
  'rad-parser shallow': b => parse(b, { type: 'shallow' }),
};

const results: Record<string, number[]> = {};
for (let r = 0; r < rounds + 2; r++) {
  for (const [name, fn] of Object.entries(runners)) {
    const t0 = performance.now();
    for (const b of files) fn(b);
    const dt = performance.now() - t0;
    if (r >= 2) (results[name] ??= []).push(dt); // first 2 rounds: warm-up
  }
}
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
console.log(`${files.length} files, ${rounds} rounds (median ms per round)`);
for (const [name, times] of Object.entries(results)) {
  console.log(`${name.padEnd(36)} ${median(times).toFixed(1)}`);
}
