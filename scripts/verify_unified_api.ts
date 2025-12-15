import { parse } from "../src/index.ts";
import * as fs from "fs";
import * as path from "path";

const TEST_FILE_PATH = path.resolve(
    process.cwd(),
    "test_data/patient/DICOM/18CBDD76",
);

function runTest() {
    const fileBytes = new Uint8Array(fs.readFileSync(TEST_FILE_PATH));
    console.log("Testing Unified API...");

    // 0. Default (Full)
    console.log("\n--- Test 0: Default (Full) ---");
    const resultRealDefault = parse(fileBytes);
    if ("dict" in resultRealDefault) {
        console.log("✅ Default returned Full dataset");
    } else {
        console.error("❌ Default failed to return Full dataset");
    }

    // 1. Explicit Shallow
    console.log("\n--- Test 1: Explicit Shallow ---");
    const resultDefault = parse(fileBytes, { type: "shallow" });
    // Check if it has dataOffset (shallow element)
    const tag = "x00100010"; // Patient Name
    if (resultDefault[tag] && "dataOffset" in resultDefault[tag]) {
        console.log("✅ Default returned Shallow dataset");
    } else {
        console.error("❌ Default failed to return Shallow dataset");
    }

    // 2. Full
    console.log("\n--- Test 2: Full ---");
    const resultFull = parse(fileBytes, { type: "full" });
    if (
        "dict" in resultFull &&
        resultFull.dict[tag] &&
        resultFull.dict[tag].Value
    ) {
        console.log("✅ Full returned Deep dataset with values");
    } else {
        console.error("❌ Full failed");
    }

    // 3. Light
    console.log("\n--- Test 3: Light (No Pixel Data) ---");
    const resultLight = parse(fileBytes, { type: "light" });
    const pixelTag = "x7fe00010";
    if ("dict" in resultLight && !resultLight.dict[pixelTag]) {
        console.log("✅ Light skipped pixel data (not in dict)");
        // Note: rad-parser implementation of mediumParse might include the tag but with undefined value or null?
        // Let's check logic: mediumParse -> ParseOptions.skipPixelData -> logic in parseDataElements?
        // Actually mediumParse calls parseWithMetadata({ skipPixelData: true })
        // parseDataElements logic: if (context.skipPixelData && isPixelData) { view.seek... return null } -> returns null
        // parseElement returns null? then it is NOT added to dict.
        // So checking !dict[tag] is correct.
    } else if (
        resultLight.dict[pixelTag] &&
        resultLight.dict[pixelTag].Value === undefined
    ) {
        console.log("✅ Light skipped pixel data value");
    } else {
        console.error(
            "❌ Light included pixel data value?",
            resultLight.dict[pixelTag],
        );
    }

    // 4. Custom (Filtered) -> Now Universal Filtering
    console.log("\n--- Test 4: Filtered (using shallow + tags) ---");
    const customTags = ["x00100010", "00280010"]; // PatientName, Rows
    const resultCustom = parse(fileBytes, {
        type: "shallow",
        tags: customTags,
    });
    if (resultCustom["x00100010"] && !resultCustom["x0020000D"]) {
        console.log("✅ Filtered shallow parse included filtered tags only");
    } else {
        console.error("❌ Filtered shallow parse failed filter check");
        console.log("Keys:", Object.keys(resultCustom));
    }

    // 5. Lazy
    console.log("\n--- Test 5: Lazy ---");
    const resultLazy = parse(fileBytes, { type: "lazy" });
    if ("dict" in resultLazy) {
        // Access a property
        const val = resultLazy.dict["x00100010"];
        console.log("Accessed Lazy Value:", val?.Value);
        if (val && val.Value) {
            console.log("✅ Lazy access successful");
        } else {
            console.error("❌ Lazy access failed");
        }
    } else {
        console.error("❌ Lazy did not return dataset");
    }

    // 6. Filtered with 'tags' single string option
    console.log("\n--- Test 6: Filtered (single tag shorthand) ---");
    const resultTag = parse(fileBytes, { type: "shallow", tags: "x00100010" });
    if (resultTag["x00100010"] && !resultTag["x00100020"]) {
        console.log("✅ Filtered single tag option worked");
    } else {
        console.error("❌ Filtered single tag failed");
    }

    // 7. Lazy with Filtering
    console.log("\n--- Test 7: Lazy with Filtering ---");
    const resultLazyFiltered = parse(fileBytes, {
        type: "lazy",
        tags: ["x00100010"],
    });
    if ("dict" in resultLazyFiltered) {
        if (resultLazyFiltered.dict["x00100010"]) {
            console.log("✅ Lazy filtered allowed included tag");
        } else {
            console.error("❌ Lazy filtered missing included tag");
        }

        if (!resultLazyFiltered.dict["x00100020"]) {
            console.log("✅ Lazy filtered blocked excluded tag");
        } else {
            console.error("❌ Lazy filtered leaked excluded tag");
        }
    }
}

runTest();
