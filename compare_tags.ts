import * as fs from "fs";
import * as path from "path";
import { parse } from "./src/core/parser";

const TEST_STUDY_DIR = "./test_data/TEST_STUDY";

function getOneFile(dir: string): string | null {
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            const res = getOneFile(fullPath);
            if (res) return res;
        } else if (stat.isFile() && stat.size > 132) {
            return fullPath;
        }
    }
    return null;
}

function getAllTagsRecursive(dict: any): string[] {
    let tags = Object.keys(dict);
    for (const tag of Object.keys(dict)) {
        const elem = dict[tag];
        if (elem && elem.items) {
            elem.items.forEach((item: any) => {
                if (item.elements) {
                    tags = tags.concat(getAllTagsRecursive(item.elements));
                }
            });
        }
    }
    return tags;
}

async function compareFullShallow() {
    const filePath = getOneFile(TEST_STUDY_DIR);
    if (!filePath) {
        console.log("No file found");
        return;
    }

    console.log(`Comparing ${filePath}`);
    const data = fs.readFileSync(filePath);

    const fullResult = parse(data, { type: "full" });
    const fullTags = Object.keys((fullResult as any).dict || {}).sort();
    const fullTagsRecursive = Array.from(
        new Set(getAllTagsRecursive((fullResult as any).dict || {}))
    ).sort();

    const shallowResult = parse(data, { type: "shallow" });
    const shallowTags = Object.keys(shallowResult).sort();

    console.log(`Full top-level count: ${fullTags.length}`);
    console.log(`Full recursive count: ${fullTagsRecursive.length}`);
    console.log(`Shallow count: ${shallowTags.length}`);

    const inShallowOnly = shallowTags.filter(
        t => !fullTagsRecursive.includes(t)
    );
    const inFullRecursiveOnly = fullTagsRecursive.filter(
        t => !shallowTags.includes(t)
    );

    console.log(
        `In Shallow only (missing from Full entirely): ${inShallowOnly.join(", ")}`
    );
    console.log(
        `In Full Recursive only: ${inFullRecursiveOnly.slice(0, 10).join(", ")}${inFullRecursiveOnly.length > 10 ? "..." : ""}`
    );

    // Check if missing tags from top-level are in sub-sequences
    const missingInTopLevelFull = shallowTags.filter(
        t => !fullTags.includes(t)
    );
    for (const t of missingInTopLevelFull) {
        if (fullTagsRecursive.includes(t)) {
            console.log(
                `Tag ${t} is missing from top-level but present in a sequence.`
            );
        } else {
            console.log(`Tag ${t} is COMPLETELY MISSING from Full.`);
        }
    }
}

compareFullShallow();
