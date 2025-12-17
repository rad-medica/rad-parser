import { describe, expect, it } from "vitest";
import { createAnonymizerStream } from "../../src/core/anonymizer-stream";
import { createDicomTransformer } from "../../src/core/transform";
import { write } from "../../src/core/writer";
import { createDicomWriterStream } from "../../src/core/writer-stream";

// Helper to create a proper DICOM buffer
function createDicomBuffer(): Uint8Array {
    const dataset = {
        dict: {
            x00100010: { vr: "PN", Value: ["Sensitive^Patient"] },
            x0020000d: { vr: "UI", Value: ["1.2.3.4"] }, // Study Instance UID
            x00080018: { vr: "UI", Value: ["1.2.3.4.5"] }, // SOP element in dataset
        },
        meta: {
            x00020010: { vr: "UI", Value: ["1.2.840.10008.1.2.1"] }, // Explicit LE
            // 0002,0003 Media Storage SOP Instance UID should match 0008,0018
            x00020003: { vr: "UI", Value: ["1.2.3.4.5"] },
        },
    } as any;
    return write(dataset);
}

// Helper to accumulate stream output
async function readStream(
    stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    // Concat
    let total = 0;
    for (const c of chunks) total += c.length;
    const res = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
        res.set(c, off);
        off += c.length;
    }
    return res;
}

describe("Streaming Anonymization Pipeline", () => {
    // Check if ReadableStream/TransformStream are available (Node 18+)
    if (
        typeof ReadableStream === "undefined" ||
        typeof TransformStream === "undefined"
    ) {
        console.warn("Streams not available, skipping test");
        return;
    }

    it("should parse, anonymize, and re-serialize a DICOM file", async () => {
        const inputBuffer = createDicomBuffer();

        // 1. Source Stream
        const sourceStream = new ReadableStream({
            start(controller) {
                controller.enqueue(inputBuffer);
                controller.close();
            },
        });

        // 2. Build Pipeline
        // Parser -> Anonymizer -> Writer
        const parser = new TransformStream(createDicomTransformer());
        const anonymizer = new TransformStream(
            createAnonymizerStream({
                patientIdPrefix: "TEST_ANON",
                replacements: {
                    x00100010: "Anonymized^Name",
                },
            })
        );
        const writer = new TransformStream(createDicomWriterStream());

        const outputStream = sourceStream
            .pipeThrough(parser)
            .pipeThrough(anonymizer)
            .pipeThrough(writer);

        // 3. Read Output
        // 3. Read Output
        const outputBuffer = await readStream(outputStream);

        expect(outputBuffer.length).toBeGreaterThan(0);

        // 4. Verify Output Content
        // We can use our Parser to parse the output and check values!
        const verifyParser = createDicomTransformer();
        const verifyElements: any[] = [];
        const controller = {
            enqueue: (el: any) => verifyElements.push(el),
            error: (e: any) => {
                throw e;
            },
            terminate: () => {},
            desiredSize: 0,
        };

        verifyParser.start(controller);
        verifyParser.transform(outputBuffer, controller);
        verifyParser.flush(controller);

        // Check Anonymization
        const patientNameWrapper = verifyElements.find(
            el => el.dict && el.dict["x00100010"]
        );
        expect(patientNameWrapper).toBeDefined();
        const patientName = patientNameWrapper.dict["x00100010"];

        // Should be "Anonymized^Name" based on replacement
        let val = patientName.Value[0];
        if (typeof val === "object" && val.Alphanumeric) val = val.Alphanumeric;
        expect(val).toBe("Anonymized^Name");

        // Check UID (0008,0018) should be anonymized (default rule is U)
        const sopInstanceWrapper = verifyElements.find(
            el => el.dict && el.dict["x00080018"]
        );
        const sopInstance = sopInstanceWrapper.dict["x00080018"];
        const sopVal = sopInstance.Value[0];
        expect(sopVal).not.toBe("1.2.3.4.5");
        expect(sopVal).toMatch(/^2\.25\./); // Standard anon UID prefix in our logic

        // Check Metadata Consistency
        // The WriterStream should have rewritten 0002,0003 to match 0008,0018 if we did it right?
        // Wait, WriterStream buffers 0002 elements.
        // It sees 0002,0003. It writes it.
        // Then it sees 0008,0018. It writes it.
        // If Anonymizer updated BOTH, then they match.
        // Does Anonymizer update 0002,0003?
        // BASIC_PROFILE_RULES usually includes 0008,0018.
        // Does it include 0002,0003?
        // We need to check anonymizationRules.ts or just verify behavior.
        // Typically Anonymizer strips or replaces Group 2.
        // If our Anonymizer logic sees 0002,0003, it applies rules.
        // If rule says 'U', it replaces.

        // Let's check 0002,0003
        const metaSopWrapper = verifyElements.find(
            el => el.dict && el.dict["x00020003"]
        );
        // It might be stripped if WriterStream swallowed it to regenerate?
        // WriterStream regenerates 0002,0000. It writes others.
        // So 0002,0003 should be there.
        expect(metaSopWrapper).toBeDefined();
        const metaSopVal = metaSopWrapper.dict["x00020003"].Value[0];

        // Ideally they match.
        // Since we use the same `uidMap` in `anonymizer-stream`, if both tags had same original value, map returns same new value.
        expect(metaSopVal).toBe(sopVal);
    });
});
