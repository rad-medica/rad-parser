import { readFileSync, writeFileSync } from "fs";
import * as path from "path";
import { initCoreWasm, parse, write } from "../src/index";
import { transcode } from "../src/utils/transcode";

// Import to trigger side-effects for auto-registration
import "../src/codecs/auto-register";

const logFile = path.resolve(__dirname, "../conversion_debug.txt");
require("fs").writeFileSync(logFile, "");
const originalLog = console.log;
const originalError = console.error;
const fs = require("fs");

console.log = (...args) => {
    const msg = args.map(a => String(a)).join(" ");
    originalLog(msg);
    fs.appendFileSync(logFile, msg + "\n");
};

console.error = (...args) => {
    const msg = args.map(a => String(a)).join(" ");
    originalError(msg);
    fs.appendFileSync(logFile, "[ERROR] " + msg + "\n");
};

async function main() {
    const inputFile = path.resolve(
        __dirname,
        "../test_data/EDGE_CASES/ALL/CT_small.dcm"
    );
    const outputDir = path.resolve(__dirname, "../test_data/output_conversion");

    console.log(`Input: ${inputFile}`);
    console.log(`Output Dir: ${outputDir}`);

    // Clean output directory
    if (require("fs").existsSync(outputDir)) {
        require("fs")
            .readdirSync(outputDir)
            .forEach((file: string) => {
                require("fs").unlinkSync(path.join(outputDir, file));
            });
    } else {
        require("fs").mkdirSync(outputDir, { recursive: true });
    }

    // Init Core WASM
    const wasmCorePath = path.resolve(
        __dirname,
        "../src/zig-core/zig-out/bin/rad-core.wasm"
    );
    if (!require("fs").existsSync(wasmCorePath)) {
        throw new Error(
            `Core WASM not found at ${wasmCorePath}. Please run 'bun run build:wasm:core'`
        );
    }
    await initCoreWasm(new Uint8Array(readFileSync(wasmCorePath)));

    // Load Input
    const buffer = new Uint8Array(readFileSync(inputFile));
    const dataset = parse(buffer, { type: "full" });

    // Define jobs
    const jobs = [
        { name: "CT_rle.dcm", uid: "1.2.840.10008.1.2.5" },
        { name: "CT_jpeg_base.dcm", uid: "1.2.840.10008.1.2.4.50" },
        { name: "CT_j2k.dcm", uid: "1.2.840.10008.1.2.4.90" },
        { name: "CT_jpegls.dcm", uid: "1.2.840.10008.1.2.4.80" },
        { name: "CT_native.dcm", uid: "1.2.840.10008.1.2.1" },
    ];

    for (const job of jobs) {
        console.log(`\n--- Converting to ${job.name} (${job.uid}) ---`);
        try {
            // Re-parse to ensure fresh dataset for each conversion
            const dataset = parse(buffer, { type: "full" });

            if (!dataset.dict["x00020010"]) {
                dataset.dict["x00020010"] = {
                    vr: "UI",
                    Value: ["1.2.840.10008.1.2.1"],
                };
            }

            const newDataset = await transcode(dataset, {
                targetTransferSyntax: job.uid,
            });

            console.log(`Writing...`);
            const outBytes = write(newDataset, { transferSyntax: job.uid });
            writeFileSync(path.join(outputDir, job.name), outBytes);
            console.log(`Success: ${job.name}`);
        } catch (e: any) {
            console.error(`FAILED ${job.name}: ${e.message}`);
            if (e.stack) console.error(e.stack);
        }
    }
}

main().catch(console.error);
