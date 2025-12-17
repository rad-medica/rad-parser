/**
 * Web Streams API Integration for RAD-Parser
 *
 * Provides a Transformer object compatible with the TransformStream constructor.
 * Allows easy integration with fetch API streams, Node.js streams, etc.
 *
 * Usage:
 *   const response = await fetch('image.dcm');
 *   const stream = response.body.pipeThrough(new TransformStream(createDicomTransformer()));
 *   // read from stream...
 */

import { StreamingParser, type StreamingOptions } from "./streaming";

/**
 * Interface for the controller passed to the transformer methods
 * Mimics TransformStreamDefaultController
 */
interface TransformerController {
    enqueue(chunk: any): void;
    error(reason: any): void;
    terminate(): void;
    desiredSize: number | null;
}

/**
 * Creates a transformer object for use with the Web Streams API TransformStream.
 *
 * @param options - Configuration options for the underlying StreamingParser
 * @returns A transformer object implementing start(), transform(), and flush()
 */
export function createDicomTransformer(
    options: Omit<StreamingOptions, "onElement" | "onError"> = {}
) {
    let parser: StreamingParser | null = null;

    return {
        /**
         * Called when the stream starts.
         * Initializes the parser.
         */
        start(controller: TransformerController) {
            parser = new StreamingParser({
                ...options,
                // Redirect parser events to the stream controller
                onElement: element => {
                    controller.enqueue(element);
                },
                onError: error => {
                    controller.error(error);
                },
            });
        },

        /**
         * Called when a new chunk is available.
         * Feeds the chunk to the parser.
         */
        transform(chunk: Uint8Array, controller: TransformerController) {
            if (!parser) {
                controller.error(new Error("Parser not initialized"));
                return;
            }
            try {
                parser.processChunk(chunk);
            } catch (err) {
                controller.error(err);
            }
        },

        /**
         * Called when the stream has no more data.
         * Finalizes parsing.
         */
        flush(controller: TransformerController) {
            if (parser) {
                try {
                    parser.finalize();
                } catch (err) {
                    controller.error(err);
                }
            }
        },
    };
}
