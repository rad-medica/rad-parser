import * as fs from "fs";
import * as path from "path";

const IGNORE_DIRS = new Set([
    ".git",
    "node_modules",
    "dist",
    "wasm-codecs-build",
    "wasm-core-build",
    ".gemini",
]);
const BINARY_EXTENSIONS = new Set([
    ".wasm",
    ".png",
    ".jpg",
    ".jpeg",
    ".dcm",
    ".exe",
    ".node",
    ".dll",
]);

function isBinary(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) return true;

    // Quick heuristic: checks first 512 bytes for null characters (common in binary)
    // This avoids corrupting files that don't have an extension
    try {
        const buffer = Buffer.alloc(512);
        const fd = fs.openSync(filePath, "r");
        const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
        fs.closeSync(fd);

        for (let i = 0; i < bytesRead; i++) {
            if (buffer[i] === 0) return true;
        }
    } catch (e) {
        return false;
    }
    return false;
}

function ensureUtf8(filePath: string) {
    if (isBinary(filePath)) return;

    try {
        const buffer = fs.readFileSync(filePath);
        // Try to decode as UTF-8
        // If it was already UTF-8, this is a no-op mostly, but ensures no BOM?
        // Actually, simple read/write might not convert if we don't know source encoding.
        // Node.js fs.readFileSync without encoding returns Buffer.
        // If we treat it as utf-8 string and write it back, it enforces utf8.
        // If source was UTF-16LE, reading as UTF-8 string would garble it.
        // We need to detect.

        // Simple heuristic: If it looks like UTF-16LE (has BOM 0xFF 0xFE or nulls in ascii range), decode accordingly.

        let contentStr: string;

        // Check for BOMs
        if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
            // UTF-16LE BOM
            contentStr = buffer.toString("utf16le");
            console.log(`Converting UTF-16LE: ${filePath}`);
        } else if (
            buffer.length >= 2 &&
            buffer[0] === 0xfe &&
            buffer[1] === 0xff
        ) {
            // UTF-16BE BOM
            contentStr = buffer.toString("utf16le"); // Node doesn't support utf16be native? swap bytes?
            // Actually let's assume LE on Windows if UTF16.
            console.log(
                `Found UTF-16BE BOM (unsupported auto-convert), skipping: ${filePath}`,
            );
            return;
        } else if (
            buffer.length >= 3 &&
            buffer[0] === 0xef &&
            buffer[1] === 0xbb &&
            buffer[2] === 0xbf
        ) {
            // UTF-8 BOM - strip it
            contentStr = buffer.toString("utf8").slice(1);
            // console.log(`Stripping UTF-8 BOM: ${filePath}`); // Optional logging
            // Write back without BOM
        } else {
            // Assume UTF-8 or ASCII
            // If it was valid UTF-8, this keeps it valid.
            contentStr = buffer.toString("utf8");
        }

        fs.writeFileSync(filePath, contentStr, { encoding: "utf8" });
    } catch (e) {
        console.error(`Failed to process ${filePath}:`, e);
    }
}

function walk(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (IGNORE_DIRS.has(file)) continue;
            walk(fullPath);
        } else if (stat.isFile()) {
            ensureUtf8(fullPath);
        }
    }
}

console.log("Starting UTF-8 conversion...");
walk(process.cwd());
console.log("Finished UTF-8 conversion.");
