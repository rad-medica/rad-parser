import * as fs from "fs";
import * as path from "path";
import { parse } from "./src/core/parser";
import { StreamingParser } from "./src/core/streaming";

const TEST_DATA_DIR = "./test_data";

function getAllFiles(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllFiles(filePath));
        } else {
            results.push(filePath);
        }
    });
    return results;
}

async function findDiscrepancy() {
    const files = getAllFiles(path.join(TEST_DATA_DIR, "EDGE_CASES"));
    console.log(`Checking ${files.length} files...`);

    for (const filePath of files) {
        const data = fs.readFileSync(filePath);

        // Full parser
        let fullTags: Set<string> = new Set();
        try {
            const result = parse(data, { type: "full" });
            Object.keys((result as any).dict || {}).forEach(t =>
                fullTags.add(t)
            );
        } catch (e) {}

        // Streaming parser
        let streamTags: Set<string> = new Set();
        const streamingParser = new StreamingParser({
            onElement: el => {
                Object.keys(el.dict || {}).forEach(t => streamTags.add(t));
            },
        });
        try {
            streamingParser.initialize(data);
            streamingParser.finalize();
        } catch (e) {}

        if (fullTags.size !== streamTags.size) {
            console.log(`File: ${path.relative(TEST_DATA_DIR, filePath)}`);
            console.log(
                `  Full: ${fullTags.size}, Stream: ${streamTags.size} (Diff: ${streamTags.size - fullTags.size})`
            );

            const onlyInStream = Array.from(streamTags).filter(
                t => !fullTags.has(t)
            );
            if (onlyInStream.length > 0) {
                console.log(
                    `  Only in Stream: ${onlyInStream.slice(0, 10).join(", ")}`
                );
            }

            const onlyInFull = Array.from(fullTags).filter(
                t => !streamTags.has(t)
            );
            if (onlyInFull.length > 0) {
                console.log(
                    `  Only in Full: ${onlyInFull.slice(0, 10).join(", ")}`
                );
            }
        }
    }
}

findDiscrepancy();
