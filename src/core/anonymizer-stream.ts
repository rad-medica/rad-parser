import {
    AnonymizationContext,
    AnonymizationOptions,
    anonymizeElement,
} from "./anonymizer";
import { DicomDataSet } from "./types";

const DEFAULT_PREFIX = "ANON";

/**
 * Creates a transformer that anonymizes DicomElements in the stream.
 * Maintains state (UID map) across the stream.
 */
export function createAnonymizerStream(options: AnonymizationOptions = {}) {
    const context: AnonymizationContext = {
        prefix: options.patientIdPrefix || DEFAULT_PREFIX,
        uidMap: options.uidMap || {},
        keepPrivateTags: !!options.keepPrivateTags,
        customReplacements: options.replacements,
    };

    return {
        start() {
            // No initialization needed
        },

        transform(chunk: DicomDataSet, controller: any) {
            // Input chunk is partial DicomDataSet { dict: { [tag]: element } }
            // We process the single element in it.

            const dict = chunk.dict;
            if (!dict) {
                // Should not happen if upstream is valid
                return;
            }

            const tag = Object.keys(dict)[0];
            if (!tag) return;

            const element = dict[tag];
            if (!element) return;

            // Clone element to avoid mutation of upstream object if needed (though usually safe in stream)
            const newElement = { ...element };
            if (Array.isArray(element.Value)) {
                // Cast to avoid implicit any/union issues
                newElement.Value = [...(element.Value as any)];
            }

            // Anonymize
            const keep = anonymizeElement(tag, newElement, context);

            if (keep) {
                // Emit modified element
                controller.enqueue({
                    dict: {
                        [tag]: newElement,
                    },
                });
            }
            // If !keep, element is dropped (filtered out)
        },

        flush() {
            // nothing to flush
        },
    };
}
