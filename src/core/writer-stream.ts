import { DicomElement } from "./types";
import { serializeElement } from "./writer";

/**
 * Creates a transformer that accepts DicomElements and emits Uint8Array chunks.
 * Handles automatic Preamble generation and File Meta Information (Group 0002) buffering/rewriting.
 */
export function createDicomWriterStream() {
    let metaComplete = false;
    const metaBuffer: Record<string, DicomElement> = {};
    const PREAMBLE_LENGTH = 128;

    function flushMeta(controller: any) {
        // 1. Ensure mandatory meta elements
        // 0002,0001 File Meta Information Version
        if (!metaBuffer["x00020001"]) {
            metaBuffer["x00020001"] = {
                vr: "OB",
                Value: new Uint8Array([0x00, 0x01]),
            };
        }
        // 0002,0010 Transfer Syntax UID
        if (!metaBuffer["x00020010"]) {
            metaBuffer["x00020010"] = {
                vr: "UI",
                Value: "1.2.840.10008.1.2.1", // Explicit VR Little Endian
            };
        }
        // 0002,0012 Implementation Class UID
        if (!metaBuffer["x00020012"]) {
            metaBuffer["x00020012"] = {
                vr: "UI",
                Value: "1.2.826.0.1.3680043.9.7433.1.1",
            };
        }

        // Serialize all meta elements to calculate length
        const sortedMetaTags = Object.keys(metaBuffer).sort();
        const metaChunks: Uint8Array[] = [];

        for (const t of sortedMetaTags) {
            if (t === "x00020000") continue; // Skip existing length, we recount
            const c = serializeElement(t, metaBuffer[t]);
            if (c) metaChunks.push(c);
        }

        // Calculate 0002,0000
        const metaLength = metaChunks.reduce((acc, c) => acc + c.length, 0);
        const groupLengthElement: DicomElement = {
            vr: "UL",
            Value: metaLength,
        };
        const groupLengthChunk = serializeElement(
            "x00020000",
            groupLengthElement
        );

        if (groupLengthChunk) controller.enqueue(groupLengthChunk);

        // Write rest of meta
        for (const c of metaChunks) {
            controller.enqueue(c);
        }
    }

    return {
        start(controller: any) {
            // Write Preamble + DICM prefix immediately?
            // Better to write it when flushing meta header to keep it contiguous or write now.
            // DICM Part 10: Preamble (128 bytes 0x00) + "DICM"
            const preamble = new Uint8Array(PREAMBLE_LENGTH + 4);
            preamble.fill(0);
            preamble.set([68, 73, 67, 77], PREAMBLE_LENGTH); // DICM
            controller.enqueue(preamble);
        },

        transform(
            element: DicomElement & { tag?: string; _tag?: string },
            controller: any
        ) {
            // How do we know the tag? StreamingParser emits object { dict: { tag: element } } ?
            // No, StreamingParser emits DicomElement, but inside an object structure?
            // Let's check StreamingParser onElement.
            // It emits `DicomElement` but the tag is usually the key in `dict`.
            // Wait, StreamingParser `onElement` structure is `{ dict: { [tag]: element } }`.
            // So the input to this writable stream must be `{ dict: { [tag]: element } }`?
            // Or just `DicomElement` with a `tag` property attached?
            // The `createDicomTransformer` emits what `StreamingParser` emits.
            // `StreamingParser` emits `DicomDataSet` (partial)?
            // streaming.ts: `this.options.onElement(partialDataset)` where partialDataset contains one element.
            // So input is `DicomDataSet` (containing one element).

            // Let's assume input is `{ dict: { [tag]: element } }`.

            const tag = Object.keys(element.dict || {})[0];
            if (!tag) return;

            const dicomElement = (element as any).dict[tag];
            if (!dicomElement) return;

            if (!metaComplete) {
                if (tag.startsWith("x0002")) {
                    metaBuffer[tag] = dicomElement;
                    return;
                } else {
                    // First non-meta element seen. Flush meta header.
                    flushMeta(controller);
                    metaComplete = true;
                }
            }

            // Serialize and write current element
            const chunk = serializeElement(tag, dicomElement);
            if (chunk) {
                controller.enqueue(chunk);
            }
        },

        flush(controller: any) {
            if (!metaComplete) {
                // If we reached end but never flushed meta (e.g. only meta elements), flush now
                flushMeta(controller);
            }
        },
    };
}
