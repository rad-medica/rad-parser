/**
 * Tag Utilities: Tag format normalization and conversion
 */

/**
 * Normalize tag format to x-prefixed format (e.g., "x00100010")
 */
export function normalizeTag(tag: string): string {
    const cleanTag = tag
        .replace(/^x/i, "")
        .replace(/,/g, "")
        .replace(/[()]/g, "");
    if (cleanTag.length === 8) {
        return `x${cleanTag}`;
    }
    return tag.startsWith("x") ? tag : `x${cleanTag}`;
}

/**
 * Format tag with comma (e.g., "0010,0010")
 */
export function formatTagWithComma(tag: string): string {
    const cleanTag = tag
        .replace(/^x/i, "")
        .replace(/,/g, "")
        .replace(/[()]/g, "");
    if (cleanTag.length === 8) {
        return `${cleanTag.slice(0, 4)},${cleanTag.slice(4, 8)}`;
    }
    return cleanTag;
}
