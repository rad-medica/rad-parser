/**
 * VR lookup from the PS3.6 registry (see vrDictionary-data.ts).
 * The packed table is expanded lazily on first use.
 */
import { VR_REGISTRY_MASKED, VR_REGISTRY_PACKED } from "./vrDictionary-data";

let exact: Map<number, string> | null = null;

function load(): Map<number, string> {
    const map = new Map<number, string>();
    for (const entry of VR_REGISTRY_PACKED.split(";")) {
        map.set(parseInt(entry.slice(0, 8), 16), entry.slice(8));
    }
    return map;
}

/**
 * VR registered in PS3.6 for a standard tag, or undefined when unknown.
 * Multiple VRs are returned as e.g. "US|SS" or "OB|OW".
 */
export function lookupVR(group: number, element: number): string | undefined {
    if (!exact) exact = load();
    const tag = ((group << 16) | element) >>> 0;
    const vr = exact.get(tag);
    if (vr !== undefined) return vr;
    for (const [mask, value, maskedVR] of VR_REGISTRY_MASKED) {
        if ((tag & mask) >>> 0 === value) return maskedVR;
    }
    return undefined;
}
