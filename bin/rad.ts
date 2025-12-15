#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { parse, write, initCoreWasm } from "../src/index";
// Utilities
import { transcode } from "../src/utils/transcode";
import { dicomToImage } from "../src/utils/dicomToImage";
// Codec Init
import initCodecsWasm from "../src/wasm-codecs-build/rad_parser_wasm_codecs";
import { JpegNativeCodec } from "../src/codecs/jpegNative";
import { registry } from "../src/core/registry"; // To register native manual
import { RleCodec } from "../src/codecs/rle";
import { DicomDataSet } from "../src/core/types";

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        printHelp();
        return;
    }

    // Initialize environment
    const wasmCorePath = new URL(
        "../src/wasm-core-build/rad_parser_wasm_core_bg.wasm",
        import.meta.url,
    );
    const wasmCodecsPath = new URL(
        "../src/wasm-codecs-build/rad_parser_wasm_codecs_bg.wasm",
        import.meta.url,
    );

    // Load Wasm bytes
    const coreWasmBuffer = new Uint8Array(readFileSync(wasmCorePath));
    const codecsWasmBuffer = new Uint8Array(readFileSync(wasmCodecsPath));

    await initCoreWasm(coreWasmBuffer);
    await initCodecsWasm(codecsWasmBuffer);

    // Register Node.js-friendly codecs manually just in case auto-register relies on bundling
    registry.register(new JpegNativeCodec());
    registry.register(new RleCodec());

    try {
        switch (command) {
            case "transcode":
                await runTranscode(args.slice(1));
                break;
            case "image":
                await runImage(args.slice(1));
                break;
            case "dump":
                await runDump(args.slice(1));
                break;
            case "help":
                printHelp();
                break;
            default:
                console.error(`Unknown command: ${command}`);
                printHelp();
                process.exit(1);
        }
    } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
    }
}

async function runTranscode(args: string[]) {
    // Usage: rad transcode <input> <output> --format <uid|alias>
    if (args.length < 4) {
        // input output --format value
        console.log("Usage: rad transcode <input> <output> --format <uid>");
        return;
    }

    const inputPath = args[0];
    const outputPath = args[1];
    let targetFormat = "1.2.840.10008.1.2.1"; // Default Explicit LE

    for (let i = 2; i < args.length; i++) {
        if (args[i] === "--format" && i + 1 < args.length) {
            targetFormat = args[i + 1];
            // Resolve aliases
            if (targetFormat === "rle") targetFormat = "1.2.840.10008.1.2.5";
            if (targetFormat === "jpeg")
                targetFormat = "1.2.840.10008.1.2.4.50"; // Baseline
            if (targetFormat === "j2k") targetFormat = "1.2.840.10008.1.2.4.91";
        }
    }

    console.log(`Loading ${inputPath}...`);
    const buffer = readFileSync(inputPath);

    // Parse and explicitly handle metadata
    const result = parse(buffer) as any;
    // Handle both "checkParse" returning dataset directly (if legacy) or ParseResult
    let dataset: DicomDataSet;
    let transferSyntax: string = "1.2.840.10008.1.2.1";

    if (result.dataset && result.transferSyntax) {
        dataset = result.dataset;
        transferSyntax = result.transferSyntax;
    } else {
        // Assume result IS the dataset?
        // rad-parser's `parse` usually returns DicomDataSet in v1, but maybe ParseResult in v2?
        // Based on `dump` working, `parse` returns something that has `dict`.
        // If it returns ParseResult, it has `dataset` property.
        // If `dump` worked with `const dataset = parse(...) as DicomDataSet`,
        // AND `dump` accessed `dataset.dict`, implies `parse` returned the dataset DIRECTLY?
        // Let's check `parse` Implementation in `parser.ts` again.
        // It seems `parse` calls `parseWithMetadata` and might return `dataset` or `ParseResult`.

        // Safety check:
        if (result.dataset) {
            dataset = result.dataset;
            if (result.transferSyntax) transferSyntax = result.transferSyntax;
        } else {
            dataset = result;
        }
    }

    // INJECT TransferSyntax back into dataset for transcode util
    if (!dataset.dict["x00020010"]) {
        dataset.dict["x00020010"] = {
            vr: "UI",
            Value: [transferSyntax],
        };
    }

    console.log(`Transcoding to ${targetFormat}...`);
    const newDataset = await transcode(dataset, {
        targetTransferSyntax: targetFormat,
    });

    console.log(`Writing ${outputPath}...`);
    // Note: 'write' handles explicit/implicit VR but we need to ensure Encapsulated Pixel Data
    // is written correctly. Our 'transcode' utility hacks the dict to make 'write' work,
    // assuming 'write' respects the buffer contents for OB/OW or SQ.
    const outputBuffer = write(newDataset, { transferSyntax: targetFormat });
    writeFileSync(outputPath, outputBuffer);
    console.log("Done.");
}

async function runImage(args: string[]) {
    // Usage: input output --format png|jpeg --frame 0
    if (args.length < 2) {
        console.log(
            "Usage: rad image <input.dcm> <output.png> [--frame 0] [--format png]",
        );
        return;
    }

    const inputPath = args[0];
    const outputPath = args[1];

    // Parse args simply
    let frame = 0;
    let format: "image/png" | "image/jpeg" = "image/png";
    const autoWindow = true;

    for (let i = 2; i < args.length; i++) {
        if (args[i] === "--frame") frame = parseInt(args[i + 1]);
        if (args[i] === "--format") {
            const f = args[i + 1];
            if (f === "jpeg" || f === "jpg") format = "image/jpeg";
        }
    }

    console.log(`Loading ${inputPath}...`);
    const buffer = readFileSync(inputPath);
    // Cast to DicomDataSet
    const dataset = parse(buffer) as DicomDataSet;

    console.log(`Exporting frame ${frame} to ${format}...`);
    const imageBuffer = await dicomToImage(dataset, {
        frame,
        format,
        autoWindow,
    });

    writeFileSync(outputPath, imageBuffer);
    console.log(`Saved to ${outputPath}`);
}

async function runDump(args: string[]) {
    // Usage: rad dump <input.dcm>
    if (args.length < 1) {
        console.log("Usage: rad dump <input.dcm>");
        return;
    }

    const inputPath = args[0];
    console.log(`Loading ${inputPath}...`);
    const buffer = readFileSync(inputPath);
    const result = parse(buffer) as any;
    const dataset = result.dataset ? result.dataset : (result as DicomDataSet);

    console.log(`\nTAG       | VR | VALUE`);
    console.log(`----------+----+--------------------------------`);

    const sortedTags = Object.keys(dataset.dict).sort();
    for (const tag of sortedTags) {
        // Skip internal or meta keys if mixed (meta often starts with x0002)
        // rad-parser keys are xGGGGEEEE
        if (!tag.startsWith("x")) continue;

        const el = dataset.dict[tag];
        const group = tag.substring(1, 5);
        const element = tag.substring(5, 9);
        const tagStr = `(${group},${element})`;

        // Format Value
        let valStr = "";
        if (el.Value instanceof Uint8Array) {
            valStr = `[Uint8Array ${el.Value.length} bytes]`;
        } else if (Array.isArray(el.Value)) {
            valStr = el.Value.map((v) => String(v))
                .join("\\")
                .substring(0, 100);
            if (el.Value.length > 50 || valStr.length >= 100) valStr += "...";
        } else if (typeof el.Value === "string") {
            valStr = el.Value.substring(0, 100);
            if (el.Value.length >= 100) valStr += "...";
        } else {
            valStr = String(el.Value);
        }

        console.log(`${tagStr} | ${el.vr || "  "} | ${valStr}`);
    }
}

function printHelp() {
    console.log(`
rad-parser CLI v2.0.0

Commands:
  transcode <in> <out> --format <uid|rle|jpeg>   Convert DICOM transfer syntax
  image     <in> <out> [--frame 0]               Export DICOM frame to image
  dump      <in>                                 Dump DICOM tags to stdout
  help                                           Show this help
`);
}

main();
