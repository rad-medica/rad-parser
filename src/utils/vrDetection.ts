/**
 * VR Detection: Implicit VR detection based on tag patterns
 *
 * Provides VR detection for implicit transfer syntax files.
 */

// Dictionary import removed - not needed for VR detection

/**
 * VR types that have explicit length (2 bytes reserved + 4 bytes length)
 */
export const EXPLICIT_LENGTH_VR = new Set([
    "OB",
    "OD",
    "OF",
    "OL",
    "OW",
    "SQ",
    "UC",
    "UN",
    "UR",
    "UT",
]);

/**
 * Common VR patterns based on tag groups and elements (Combined as unique 32-bit integer)
 * Key = (Group << 16) | Element
 */
const VR_MAP = new Map<number, string>([
    // Patient Information (Group 0010)
    [0x00100010, "PN"], // Patient's Name
    [0x00100020, "LO"], // Patient ID
    [0x00100021, "LO"], // Issuer of Patient ID
    [0x00100030, "DA"], // Patient's Birth Date
    [0x00100032, "TM"], // Patient's Birth Time
    [0x00100040, "CS"], // Patient's Sex
    [0x00100050, "LO"], // Patient's Insurance Plan Code Sequence
    [0x00100101, "AS"], // Patient's Age
    [0x00100102, "DS"], // Patient's Size
    [0x00100103, "DS"], // Patient's Weight

    // Study Information (Group 0020)
    [0x0020000d, "UI"], // Study Instance UID
    [0x0020000e, "UI"], // Series Instance UID
    [0x00200010, "SH"], // Study ID
    [0x00200011, "IS"], // Series Number
    [0x00200012, "IS"], // Acquisition Number
    [0x00200013, "IS"], // Instance Number
    [0x00200020, "CS"], // Patient Orientation
    [0x00200032, "DS"], // Image Position Patient
    [0x00200037, "DS"], // Image Orientation Patient

    // Image Information (Group 0028)
    [0x00280002, "US"], // Samples per Pixel
    [0x00280004, "CS"], // Photometric Interpretation
    [0x00280010, "US"], // Rows
    [0x00280011, "US"], // Columns
    [0x00280030, "DS"], // Pixel Spacing
    [0x00280031, "DS"], // Slice Thickness
    [0x00280100, "US"], // Bits Allocated
    [0x00280101, "US"], // Bits Stored
    [0x00280102, "US"], // High Bit
    [0x00280103, "US"], // Pixel Representation
    [0x00280106, "US"], // Smallest Image Pixel Value
    [0x00280107, "US"], // Largest Image Pixel Value
    [0x00281050, "DS"], // Window Center
    [0x00281051, "DS"], // Window Width
    [0x00281052, "DS"], // Rescale Intercept
    [0x00281053, "DS"], // Rescale Slope

    // Identifying Information (Group 0008)
    [0x00080005, "CS"], // Specific Character Set
    [0x00080008, "CS"], // Image Type
    [0x00080012, "DA"], // Instance Creation Date
    [0x00080013, "TM"], // Instance Creation Time
    [0x00080016, "UI"], // SOP Class UID
    [0x00080018, "UI"], // SOP Instance UID
    [0x00080020, "DA"], // Study Date
    [0x00080030, "TM"], // Study Time
    [0x00080050, "SH"], // Accession Number
    [0x00080060, "CS"], // Modality
    [0x00080070, "LO"], // Manufacturer
    [0x00080080, "LO"], // Institution Name
    [0x00080090, "PN"], // Referring Physician's Name
    [0x00081030, "LO"], // Study Description
    [0x0008103e, "LO"], // Series Description
    [0x00081050, "PN"], // Performing Physician's Name
    [0x00081070, "PN"], // Operators' Name
    [0x00081080, "LO"], // Admitting Diagnoses Description
    [0x00081090, "LO"], // Manufacturer's Model Name
    [0x00081150, "UI"], // Referenced SOP Class UID
    [0x00081155, "UI"], // Referenced SOP Instance UID

    // Equipment Information (Group 0018)
    [0x00180015, "CS"], // Body Part Examined
    [0x00180020, "CS"], // Scanning Sequence
    [0x00180021, "CS"], // Sequence Variant
    [0x00180022, "CS"], // Scan Options
    [0x00180050, "DS"], // Slice Thickness
    [0x00180060, "DS"], // KVP
    [0x00180081, "DS"], // Echo Time
    [0x00180082, "DS"], // Inversion Time
    [0x00180083, "DS"], // Number of Averages
    [0x00180088, "DS"], // Spacing Between Slices
    [0x00180090, "DS"], // Data Collection Diameter
    [0x00181000, "LO"], // Device Serial Number
    [0x00181020, "LO"], // Software Version
    [0x00181030, "LO"], // Protocol Name
    [0x00181050, "DS"], // Slice Location
    [0x00181200, "DA"], // Date of Last Calibration
    [0x00181201, "TM"], // Time of Last Calibration

    // Pixel Data
    [0x7fe00010, "OB"], // Pixel Data (usually OB or OW)
]);

/**
 * Detect VR for a tag in implicit VR transfer syntax
 * @param group - Tag group (e.g., 0x0010)
 * @param element - Tag element (e.g., 0x0010)
 * @returns Detected VR or 'UN' if unknown
 */
export function detectVR(group: number, element: number): string {
    // Optimization: use integer key for map lookup (Group << 16 | Element)
    // This avoids string allocation `${group}...`
    const key = (group << 16) | element;

    // Check explicit patterns first
    const explicitVR = VR_MAP.get(key);
    if (explicitVR) {
        return explicitVR;
    }

    // Check common patterns based on group
    if (group === 0x0002) {
        // File Meta Information - usually UI, UL, OB
        if (element === 0x0000 || element === 0x0001) return "UL";
        if (
            element === 0x0002 ||
            element === 0x0003 ||
            element === 0x0010 ||
            element === 0x0012
        )
            return "UI";
        return "OB";
    }

    if (group === 0x0008) {
        // Identifying Information - common VRs
        if (element === 0x0005) return "CS"; // Character Set
        if (
            element === 0x0006 ||
            element === 0x0016 ||
            element === 0x0018 ||
            element === 0x1150 ||
            element === 0x1155
        )
            return "UI"; // UIDs
        if (element >= 0x0012 && element <= 0x0015) return "DA"; // Dates
        if (element >= 0x0030 && element <= 0x0035) return "TM"; // Times
        return "LO"; // Default for 0008 group
    }

    if (group === 0x0010) {
        // Patient Information
        if (element === 0x0010) return "PN"; // Patient Name
        if (element === 0x0010 || element === 0x0020 || element === 0x0021)
            return "LO"; // IDs
        if (element === 0x0030 || element === 0x0032) return "DA"; // Dates
        if (element === 0x0101) return "AS"; // Age
        return "LO";
    }

    if (group === 0x0018) {
        // Equipment Information
        if (element >= 0x0012 && element <= 0x0015) return "DA"; // Dates
        if (element >= 0x0016 && element <= 0x0019) return "TM"; // Times
        if (element >= 0x0050 && element <= 0x0090) return "DS"; // Numeric values
        return "LO";
    }

    if (group === 0x0020) {
        // Study/Series/Image Information
        if (element === 0x000d || element === 0x000e) return "UI"; // UIDs
        if (
            element === 0x0010 ||
            element === 0x0011 ||
            element === 0x0012 ||
            element === 0x0013
        )
            return "SH"; // IDs
        if (element === 0x0032 || element === 0x0037) return "DS"; // Position/Orientation
        return "IS";
    }

    if (group === 0x0028) {
        // Image Pixel Information
        if (element >= 0x0002 && element <= 0x0004) return "US";
        if (element === 0x0010 || element === 0x0011) return "US"; // Rows/Columns
        if (element >= 0x0030 && element <= 0x0031) return "DS"; // Spacing
        if (element >= 0x0100 && element <= 0x0103) return "US"; // Bits
        if (element >= 0x0106 && element <= 0x0107) return "US"; // Pixel values
        if (element >= 0x1050 && element <= 0x1053) return "DS"; // Window/Rescale
        return "US";
    }

    if (group === 0x7fe0 && element === 0x0010) {
        // Pixel Data
        return "OB"; // Usually OB, but could be OW
    }

    // Default: Unknown
    return "UN";
}

/**
 * Check if VR requires explicit length encoding
 */
export function requiresExplicitLength(vr: string): boolean {
    return EXPLICIT_LENGTH_VR.has(vr);
}

/**
 * Detect VR for private tags based on length and common patterns
 * Private tags (odd group numbers) don't have standard VR definitions
 */
export function detectVRForPrivateTag(
    _group: number,
    _element: number,
    length: number,
): string {
    // Common patterns for private tags based on length and element number
    if (length === 0) {
        return "UN";
    }

    // Very short values are often strings or numbers
    if (length <= 4) {
        // Could be US, SS, IS, DS, or short string
        if (length === 2) {
            return "US"; // Most common for 2-byte values
        }
        if (length === 4) {
            return "UL"; // Common for 4-byte values
        }
        return "LO"; // Default to string for odd lengths
    }

    // Medium length - likely strings
    if (length <= 64) {
        return "LO";
    }

    // Long values - could be strings, binary, or sequences
    if (length <= 1024) {
        return "OB"; // Binary data
    }

    // Very long - likely binary or sequence
    if (length === 0xffffffff) {
        return "SQ"; // Sequence
    }

    // Default to binary for very long values
    return "OB";
}
