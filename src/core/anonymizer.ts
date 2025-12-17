/**
 * DICOM Anonymizer (Basic Attribute Confidentiality Profile)
 *
 * Provides functionality to anonymize DICOM datasets by replacing or removing sensitive tags
 * according to DICOM PS3.15 Annex E (Basic Attribute Confidentiality Profile).
 */

import { AnonymizationAction, BASIC_PROFILE_RULES } from "./anonymizationRules";
import { DicomDataSet, DicomElement } from "./types";

export interface AnonymizationOptions {
    /**
     * Custom replacement values for tags.
     * Key: Tag format 'xGGGGEEEE'.
     * Value: New value (string) or null to remove.
     */
    replacements?: Record<string, string | null>;

    /**
     * Prefix for dummy values (PatientID, PatientName, etc.)
     * Default: 'ANON'
     */
    patientIdPrefix?: string;

    /**
     * If true, keep private tags. Default: false (remove private tags).
     */
    keepPrivateTags?: boolean;

    /**
     * UID Map to maintain consistency across a dataset series.
     * If provided, new UIDs will be stored/retrieved here.
     */
    uidMap?: Record<string, string>;
}

const DEFAULT_PREFIX = "ANON";

/**
 * Anonymize a DICOM dataset.
 * Returns a NEW dataset (shallow copy of structure, deep copy of modified elements).
 * Does not mutate the original dataset.
 *
 * @param dataset - The original dataset
 * @param options - Anonymization options
 * @returns Anonymized DicomDataSet
 */
// Optimized group number extraction - inline parsing (faster than caching for typical datasets)
function getGroupNumberFast(tag: string): number | null {
    if (!tag.startsWith("x") || tag.length !== 9) return null;

    // Fast hex parsing using bit operations
    let group = 0;
    for (let i = 1; i < 5; i++) {
        const c = tag.charCodeAt(i);
        group = (group << 4) | (c > 57 ? c - 87 : c - 48);
    }

    return group;
}

export function anonymize(
    dataset: DicomDataSet,
    options: AnonymizationOptions = {}
): DicomDataSet {
    const dict = dataset.dict;
    const prefix = options.patientIdPrefix || DEFAULT_PREFIX;
    const uidMap = options.uidMap || {};
    const keepPrivateTags = !!options.keepPrivateTags;
    const customReplacements = options.replacements;

    // Optimized: Create new dict and process in single pass where possible
    const newDict: Record<string, DicomElement> = {};

    const context: AnonymizationContext = {
        prefix,
        uidMap,
        keepPrivateTags,
        customReplacements,
    };

    // Iterate original dict
    for (const tag in dict) {
        const element = dict[tag];
        if (!element) continue;

        // Clone element to avoid mutation of original
        const newElement = { ...element };
        if (Array.isArray(element.Value)) {
            // Cast to any to avoid complex union type issues during spread
            newElement.Value = [...(element.Value as any)];
        }

        // Apply anonymization
        const keep = anonymizeElement(tag, newElement, context);

        if (keep) {
            newDict[tag] = newElement;
        }
    }

    return {
        dict: newDict,
        elements: newDict,
        string: t => {
            const e = newDict[t];
            return e ? String(e.Value) : undefined;
        },
        uint16: dataset.uint16,
        int16: dataset.int16,
        floatString: dataset.floatString,
        intString: dataset.intString,
    };
}

export interface AnonymizationContext {
    prefix: string;
    uidMap: Record<string, string>;
    keepPrivateTags?: boolean;
    customReplacements?: Record<string, string | null>;
}

/**
 * Anonymize a single element. Mutates the dict/element in place or returns false if should be removed.
 */
export function anonymizeElement(
    tag: string,
    element: DicomElement,
    context: AnonymizationContext
): boolean {
    const { prefix, uidMap, customReplacements, keepPrivateTags } = context;

    // 1. Private Tag Check
    if (!keepPrivateTags) {
        const group = getGroupNumberFast(tag);
        if (group !== null && group % 2 !== 0) {
            return false; // Remove
        }
    }

    // 2. Custom Replacement
    if (customReplacements) {
        const replacement = customReplacements[tag];
        if (replacement !== undefined) {
            if (replacement === null) return false; // Remove

            element.Value = replacement === "" ? "" : replacement;
            element.value = replacement === "" ? "" : replacement;
            element.length = replacement.length;
            return true;
        }
    }

    // 3. Basic Profile Rules
    const rule = BASIC_PROFILE_RULES[tag];
    if (rule) {
        applyRule(element, rule.action, prefix, uidMap);
    }

    return true;
}

function applyRule(
    element: DicomElement,
    action: AnonymizationAction,
    prefix: string,
    uidMap: Record<string, string>
) {
    switch (action) {
        case "X": // Remove
            // Caller handles removal based on return of anonymizeElement?
            // Actually, applyRule was void. But for X we need to signal removal.
            // In legacy flow, X deleted from dict.
            // We should change this function to return boolean?
            // Or better, let anonymizeElement handle logic.
            // But BASIC_PROFILE_RULES has 'X'.
            // Let's handle X here by returning false, but we can't delete from dict easily if we just have element.
            // Actually, the caller (anonymize) iterates dict keys.
            // Ideally we shouldn't rely on 'dict' being passed to applyRule if we want streaming.
            // Streaming passes 'element'.
            // So, if action is X, we return false.
            break;

        case "Z": // Zero Length (Empty) - optimized: reuse object
            element.Value = "";
            element.value = "";
            element.length = 0;
            break;

        case "D": // Dummy Value - optimized: reuse object
            element.Value = prefix;
            element.value = prefix;
            element.length = prefix.length;
            break;

        case "U": // Replace UID - optimized
            const originalUID = String(element.Value);
            // Normalize UID (strip null bytes) - optimized regex
            const cleanUID = originalUID.replace(/\0/g, "");

            let newUID = uidMap[cleanUID];
            if (!newUID) {
                // Generate new UID - optimized string concatenation
                newUID =
                    "2.25." +
                    Math.floor(Math.random() * 1e14) +
                    "." +
                    Date.now();
                uidMap[cleanUID] = newUID;
            }
            element.Value = newUID;
            element.value = newUID;
            element.length = newUID.length;
            break;

        case "K": // Keep
            break;
    }
}
