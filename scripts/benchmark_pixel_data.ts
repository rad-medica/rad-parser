import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import { parse, extractPixelData } from "../src/index";

const filePath = path.resolve(
    process.cwd(),
    "test_data/patient/DICOM/18CBDD76",
);

if (!fs.existsSync(filePath)) {
    console.error(`Test file not found: ${filePath}`);
    process.exit(1);
}

const fileBuffer = fs.readFileSync(filePath);
const byteArray = new Uint8Array(fileBuffer);

console.log(
    `Benchmarking Pixel Data Extraction on file size: ${(byteArray.byteLength / 1024 / 1024).toFixed(2)} MB`,
);

const iterations = 50;

function benchmark(name: string, fn: () => void) {
    try {
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            fn();
        }
        const end = performance.now();
        const total = end - start;
        const avg = total / iterations;
        console.log(
            `${name}: Total ${total.toFixed(2)}ms, Avg ${avg.toFixed(2)}ms`,
        );
        return avg;
    } catch (err: unknown) {
        console.error(
            `${name} FAILED: ${err instanceof Error ? err.message : String(err)}`,
        );
        // console.error(err);
    }
}

// 1. Full Parse (includes pixel data)
benchmark("Full Parse (Type: Full)", () => {
    const ds = parse(byteArray, { type: "full" });
});

// 2. Light Parse (skips pixel data)
benchmark("Light Parse (Type: Light)", () => {
    const ds = parse(byteArray, { type: "light" });
});

// 3. Extract Pixel Data (Standalone)
benchmark("Extract Pixel Data (Standalone)", () => {
    const pd = extractPixelData(byteArray);
});

// 4. Lazy Parse (access pixel data)
benchmark("Lazy Parse (Type: Lazy) - Access PixelData", () => {
    const ds = parse(byteArray, { type: "lazy" });
    if (ds.dict) {
        const v = ds.dict["x7fe00010"]?.Value;
    }
});

// 5. Shallow Parse (Overhead check)
benchmark("Shallow Parse (Type: Shallow)", () => {
    parse(byteArray, { type: "shallow" });
});
