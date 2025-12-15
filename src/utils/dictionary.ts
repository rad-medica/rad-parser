/**
 * DICOM Tag Dictionary (Registry)
 *
 * The actual data has been moved to dictionary-data.ts to allow for
 * tree-shaking and optional loading of the huge dictionary.
 */

export let dicomDictionary: Record<string, string> = {};

/**
 * Register a dictionary object to be used by getTagName.
 * @param dict The dictionary object 'GGGGEEEE' -> Name
 */
export function registerDictionary(dict: Record<string, string>) {
    dicomDictionary = dict;
}

/**
 * Get DICOM tag name from tag ID
 * @param tag - Tag in format 'x00100010', '00100010', or '(0010,0010)'
 * @returns Tag name or 'Unknown Tag' if not found
 */
export function getTagName(tag: string): string {
    // Remove 'x' prefix if present (dicom-parser uses x00100010 format)
    // Remove parentheses and commas if present (format: (0010,0010))
    const cleanTag = tag
        .replace(/^x/i, "")
        .replace(/[()]/g, "")
        .replace(/,/g, "")
        .toUpperCase();

    return (
        dicomDictionary[cleanTag] ||
        `Unknown Tag (${cleanTag.substring(0, 4)},${cleanTag.substring(4)})`
    );
}

/**
 * Check if a tag is a private tag (odd group number)
 */
export function isPrivateTag(tag: string): boolean {
    const cleanTag = tag
        .replace(/^x/i, "")
        .replace(/[()]/g, "")
        .replace(/,/g, "")
        .toUpperCase();
    if (cleanTag.length < 4) return false;
    const group = parseInt(cleanTag.substring(0, 4), 16);
    return group % 2 === 1;
}
