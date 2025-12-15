import dcmjs from "dcmjs";
import dicomParser from "dicom-parser";
import * as efferent from "efferent-dicom"; // Import as namespace to see all exports
import { DicomReader, DicomWriter } from "efferent-dicom"; // explicit check

console.log("--- dcmjs Exports ---");
console.log(Object.keys(dcmjs));
if (dcmjs.data) {
    console.log("dcmjs.data keys:", Object.keys(dcmjs.data));
    if (dcmjs.data.DicomMessage) {
        console.log(
            "dcmjs.data.DicomMessage prototype:",
            Object.getOwnPropertyNames(dcmjs.data.DicomMessage.prototype),
        );
    }
}

console.log("\n--- dicom-parser Exports ---");
// dicomParser default export vs namespace
console.log(Object.keys(dicomParser));

console.log("\n--- efferent-dicom Exports ---");
console.log(Object.keys(efferent));
// Check if Writer exists
console.log("Has DicomWriter?", !!DicomWriter);
console.log("Has DicomReader?", !!DicomReader);
