import { readFileSync } from 'fs';
import { parse } from './src/index';
import { DicomDataSet } from './src/core/types';

const buffer = readFileSync('test_cli.dcm');
const result = parse(buffer) as any;

let dataset: DicomDataSet;
if (result.dataset) {
    dataset = result.dataset;
} else {
    dataset = result;
}

console.log("Keys:", Object.keys(dataset).slice(0, 5));
console.log("Has intString:", typeof dataset.intString);
console.log("Has uint16:", typeof dataset.uint16);

try {
    const frames = dataset.intString("x00280008");
    console.log("Frames (intString):", frames);
} catch (e) {
    console.error("intString failed:", e);
}

try {
    const frames2 = dataset.uint16("x00280008"); // 0028,0008 is IS, might fail/return undef if uint16 expects US?
    console.log("Frames (uint16):", frames2);
} catch (e) {
    console.error("uint16 failed:", e);
}
