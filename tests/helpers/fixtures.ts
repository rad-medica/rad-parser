/**
 * Test data locations.
 *
 * `tests/fixtures/synthetic` holds small committed synthetic files (no patient
 * data). Set RAD_PARSER_TEST_DATA to a directory of extra DICOM files to run
 * the same tests on more data.
 */
import * as fs from 'fs';
import * as path from 'path';

export const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/synthetic');

/** Absolute path of a committed fixture. */
export function fixture(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

function walk(dir: string, out: string[]): void {
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (!/\.(md|json|txt|png|jpg)$/i.test(name)) out.push(p);
  }
}

/** Committed fixtures plus files under RAD_PARSER_TEST_DATA (if set). */
export function dicomTestFiles(limit = Infinity): string[] {
  const files: string[] = [];
  walk(FIXTURES_DIR, files);
  const extra = process.env.RAD_PARSER_TEST_DATA;
  if (extra && fs.existsSync(extra)) walk(extra, files);
  return files.slice(0, limit);
}
