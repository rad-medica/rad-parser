import * as fs from "fs";
import * as path from "path";

const file =
    process.argv[2] ||
    path.resolve(__dirname, "../test_data/converted_codecs/RLE_Lossless.dcm");
const data = fs.readFileSync(file);

// Find pixel data tag
let offset = -1;
for (let i = 132; i < data.length - 10; i++) {
    if (
        data[i] === 0x7f &&
        data[i + 1] === 0xe0 &&
        data[i + 2] === 0x00 &&
        data[i + 3] === 0x10
    ) {
        offset = i;
        break;
    }
}

if (offset === -1) {
    console.log("Pixel data tag not found");
    process.exit(1);
}

console.log(`Pixel Data tag found at offset: ${offset}`);
console.log(
    `VR: ${String.fromCharCode(data[offset + 4])}${String.fromCharCode(data[offset + 5])}`
);

const vr =
    String.fromCharCode(data[offset + 4]) +
    String.fromCharCode(data[offset + 5]);
const isLongVR = [
    "OB",
    "OD",
    "OF",
    "OL",
    "OW",
    "SQ",
    "UC",
    "UR",
    "UT",
    "UN",
].includes(vr);

// Detect endianness from file - check Transfer Syntax in meta header
let isBigEndian = false;
for (let i = 132; i < Math.min(offset, 500); i++) {
    if (
        data[i] === 0x00 &&
        data[i + 1] === 0x02 &&
        data[i + 2] === 0x00 &&
        data[i + 3] === 0x10
    ) {
        // Found Transfer Syntax tag - check if BE
        const tsBytes = data.slice(i + 8, i + 8 + 26);
        const ts = String.fromCharCode(
            ...Array.from(tsBytes.filter(b => b !== 0))
        );
        if (ts.includes("1.2.840.10008.1.2.2")) {
            isBigEndian = true;
        }
        break;
    }
}

if (isLongVR) {
    // Read length based on detected endianness
    let len: number;
    if (isBigEndian) {
        len =
            (data[offset + 8] << 24) |
            (data[offset + 9] << 16) |
            (data[offset + 10] << 8) |
            data[offset + 11];
    } else {
        len =
            data[offset + 8] |
            (data[offset + 9] << 8) |
            (data[offset + 10] << 16) |
            (data[offset + 11] << 24);
    }
    console.log(
        `Length (uint32 ${isBigEndian ? "BE" : "LE"}): ${len} (0x${len.toString(16).toUpperCase().padStart(8, "0")})`
    );
    console.log(`Is undefined length: ${len === 0xffffffff}`);
    console.log(
        `First 32 bytes: ${Array.from(data.slice(offset + 12, offset + 44))
            .map(b => b.toString(16).padStart(2, "0"))
            .join(" ")}`
    );

    if (len === 0xffffffff || len > 1000) {
        // Check for item tags
        const start = offset + 12;
        if (
            data[start] === 0xff &&
            data[start + 1] === 0xfe &&
            data[start + 2] === 0xe0 &&
            data[start + 3] === 0x00
        ) {
            console.log("Found item tag (FFFE E000) - encapsulated format");
            let itemLen: number;
            if (isBigEndian) {
                itemLen =
                    (data[start + 4] << 24) |
                    (data[start + 5] << 16) |
                    (data[start + 6] << 8) |
                    data[start + 7];
            } else {
                itemLen =
                    data[start + 4] |
                    (data[start + 5] << 8) |
                    (data[start + 6] << 16) |
                    (data[start + 7] << 24);
            }
            console.log(`First item length: ${itemLen}`);
        }
    }
} else {
    let len: number;
    if (isBigEndian) {
        len = (data[offset + 6] << 8) | data[offset + 7];
    } else {
        len = data[offset + 6] | (data[offset + 7] << 8);
    }
    console.log(`Length (uint16 ${isBigEndian ? "BE" : "LE"}): ${len}`);
    console.log(
        `First 32 bytes: ${Array.from(data.slice(offset + 8, offset + 40))
            .map(b => b.toString(16).padStart(2, "0"))
            .join(" ")}`
    );
}

