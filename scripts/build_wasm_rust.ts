import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const TARGET_DIR = path.join(ROOT_DIR, 'target/wasm32-unknown-unknown/release');
const DIST_PKG = path.join(ROOT_DIR, 'dist/package');

// Codec mapping
const CRATES = [
  { name: 'rad-core-wasm', outName: 'rad-core' },
  { name: 'rad-codecs-rle', outName: 'rad-codecs-rle' },
  // JPEG 1 (incl. lossless), JPEG-LS, JPEG 2000 and HTJ2K via jpegexp-rs.
  { name: 'rad-codecs-jpegexp', outName: 'rad-codecs-jpegexp' },
];

console.log('Building Rust workspace...');
try {
  execSync('cargo build --workspace --target wasm32-unknown-unknown --release', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
} catch (e) {
  console.error('Cargo build failed');
  process.exit(1);
}

console.log('Generating WASM bindings...');

// Ensure dist structure
if (!fs.existsSync(DIST_PKG)) fs.mkdirSync(DIST_PKG, { recursive: true });

// Try to find wasm-bindgen
let wasmBindgen = 'wasm-bindgen';
try {
  execSync('wasm-bindgen --version', { stdio: 'ignore' });
} catch {
  // If not in PATH, try default cargo bin
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const exe = process.platform === 'win32' ? 'wasm-bindgen.exe' : 'wasm-bindgen';
  const candidate = path.join(home, '.cargo', 'bin', exe);
  if (home && fs.existsSync(candidate)) {
    wasmBindgen = `"${candidate}"`;
  }
}

for (const crate of CRATES) {
  // Convert crate name to lib name (hyphens to underscores)
  const libName = crate.name.replace(/-/g, '_') + '.wasm';
  const wasmPath = path.join(TARGET_DIR, libName);

  if (!fs.existsSync(wasmPath)) {
    console.error(`Artifact not found: ${wasmPath}`);
    continue;
  }

  const outDir = path.join(DIST_PKG, crate.outName); // e.g. dist/package/rad-core
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`Processing ${crate.name}...`);
  try {
    // Run wasm-bindgen
    // Use --target web to get standard ES module with init function
    execSync(`${wasmBindgen} "${wasmPath}" --out-dir "${outDir}" --target web`, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
  } catch (e) {
    console.error(`wasm-bindgen failed for ${crate.name}`, e);
    process.exit(1);
  }
}

console.log('Build complete.');
