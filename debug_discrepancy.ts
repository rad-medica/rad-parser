import * as fs from "fs";
import * as path from "path";
import { parse } from "./src/core/parser";
import { StreamingParser } from "./src/core/streaming";

const EDGE_CASES_DIR = "./test_data/EDGE_CASES";

function getAllFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllFiles(file));
        } else {
            if (file.endsWith(".dcm") || !file.includes(".")) {
                results.push(file);
            }
        }
    });
    return results;
}

async function findDiscrepancy() {
    if (!fs.existsSync(EDGE_CASES_DIR)) {
        console.log("No edge cases dir at " + path.resolve(EDGE_CASES_DIR));
        return;
    }

    const files = getAllFiles(EDGE_CASES_DIR);
    console.log(`Found ${files.length} files`);

    for (const filePath of files) {
        const data = fs.readFileSync(filePath);

        // Full parser
        let fullCount = 0;
        let fullTags: string[] = [];
        try {
            const result = parse(data, { type: "full" });
            fullTags = Object.keys((result as any).dict || {});
            fullCount = fullTags.length;
        } catch (e) {}

        // Streaming parser
        let streamCount = 0;
        const streamTags: string[] = [];
        const streamingParser = new StreamingParser({
            onElement: el => {
                const keys = Object.keys(el.dict || {});
                streamTags.push(...keys);
            },
        });
        try {
            streamingParser.initialize(data);
            streamingParser.finalize();
            streamCount = streamTags.length;
        } catch (e) {}

        if (fullCount !== streamCount) {
            console.log(`File: ${path.basename(filePath)}`);
            console.log(`Full: ${fullCount}, Stream: ${streamCount}`);

            // Find missing tags
            const missingInFull = streamTags.filter(t => !fullTags.includes(t));
            const extraInFull = fullTags.filter(t => !streamTags.includes(t));

            if (missingInFull.length > 0)
                console.log(
                    `Missing in Full: ${missingInFull.slice(0, 20).join(", ")}${missingInFull.length > 20 ? "..." : ""}`
                );
            if (extraInFull.length > 0)
                console.log(
                    `Extra in Full: ${extraInFull.slice(0, 20).join(", ")}${extraInFull.length > 20 ? "..." : ""}`
                );
            console.log("---");
        }
    }
}

findDiscrepancy();
