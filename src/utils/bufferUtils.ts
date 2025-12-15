/**
 * Buffer utilities for handling binary data fragments.
 * Decoupled from core parser logic for use in standalone codecs.
 */

/**
 * Concatenate multiple Uint8Array fragments into a single Uint8Array.
 * @param fragments - An array of Uint8Array fragments.
 * @returns A single Uint8Array containing all the data from the fragments.
 */
export function concatFragments(fragments: Uint8Array[]): Uint8Array {
    const totalLength = fragments.reduce((acc, curr) => acc + curr.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of fragments) {
        combined.set(arr, offset);
        offset += arr.length;
    }
    return combined;
}
