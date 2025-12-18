/**
 * Value Parsers: Specialized parsers for different VR types
 *
 * Handles Person Name, Date/Time, Age String, and other special VR types.
 */

/**
 * Parse Person Name (PN) value
 * Format: "Family^Given^Middle^Prefix^Suffix" or "Family^Given"
 */
export function parsePersonName(value: string): {
    Alphanumeric?: string;
    Ideographic?: string;
    Phonetic?: string;
    family?: string;
    given?: string;
    middle?: string;
    prefix?: string;
    suffix?: string;
} {
    if (!value || typeof value !== "string") {
        return { Alphanumeric: value };
    }

    // PN can have multiple components separated by =
    // Each component is: Family^Given^Middle^Prefix^Suffix
    const components = value.split("=");
    const result: {
        Alphanumeric?: string;
        Ideographic?: string;
        Phonetic?: string;
        family?: string;
        given?: string;
        middle?: string;
        prefix?: string;
        suffix?: string;
    } = {};

    if (components.length > 0 && components[0]) {
        const parts = components[0].split("^");
        result.family = parts[0] || "";
        result.given = parts[1] || "";
        result.middle = parts[2] || "";
        result.prefix = parts[3] || "";
        result.suffix = parts[4] || "";
        result.Alphanumeric = value;
    }

    if (components.length > 1 && components[1]) {
        result.Ideographic = components[1];
    }

    if (components.length > 2 && components[2]) {
        result.Phonetic = components[2];
    }

    return result;
}

/**
 * Parse Date (DA) value
 * Format: YYYYMMDD
 */
export function parseDate(value: string): Date | string | Array<Date | string> {
    if (!value || typeof value !== "string") {
        return value;
    }

    // Handle multiple dates separated by backslash
    const dates = value.split("\\");
    if (dates.length === 1) {
        return parseSingleDate(dates[0]!);
    }

    return dates.map(d => parseSingleDate(d));
}

function parseSingleDate(dateStr: string): Date | string {
    if (dateStr.length === 8) {
        const year = parseInt(dateStr.substring(0, 4), 10);
        const month = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-indexed
        const day = parseInt(dateStr.substring(6, 8), 10);

        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            try {
                return new Date(year, month, day);
            } catch {
                return dateStr;
            }
        }
    }

    return dateStr;
}

/**
 * Parse Time (TM) value
 * Format: HHMMSS.FFFFFF or HHMMSS
 */
export function parseTime(value: string): Date | string | Array<Date | string> {
    if (!value || typeof value !== "string") {
        return value;
    }

    const times = value.split("\\");
    if (times.length === 1) {
        return parseSingleTime(times[0]!);
    }

    return times.map(t => parseSingleTime(t));
}

function parseSingleTime(timeStr: string): Date | string {
    // Create a date for today with the parsed time
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (timeStr.length >= 6) {
        const hours = parseInt(timeStr.substring(0, 2), 10);
        const minutes = parseInt(timeStr.substring(2, 4), 10);
        const seconds = parseInt(timeStr.substring(4, 6), 10);

        if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
            try {
                const time = new Date(today);
                time.setHours(hours, minutes, seconds);
                return time;
            } catch {
                return timeStr;
            }
        }
    }

    return timeStr;
}

/**
 * Parse DateTime (DT) value
 * Format: YYYYMMDDHHMMSS.FFFFFF&ZZZZ or YYYYMMDDHHMMSS
 */
export function parseDateTime(
    value: string
): Date | string | Array<Date | string> {
    if (!value || typeof value !== "string") {
        return value;
    }

    const dateTimes = value.split("\\");
    if (dateTimes.length === 1) {
        return parseSingleDateTime(dateTimes[0]!);
    }

    return dateTimes.map(dt => parseSingleDateTime(dt));
}

function parseSingleDateTime(dateTimeStr: string): Date | string {
    // Remove timezone if present (format: YYYYMMDDHHMMSS.FFFFFF&ZZZZ)
    const parts = dateTimeStr.split("&");
    const mainPart = parts[0]!;

    if (mainPart.length >= 14) {
        const year = parseInt(mainPart.substring(0, 4), 10);
        const month = parseInt(mainPart.substring(4, 6), 10) - 1;
        const day = parseInt(mainPart.substring(6, 8), 10);
        const hours = parseInt(mainPart.substring(8, 10), 10);
        const minutes = parseInt(mainPart.substring(10, 12), 10);
        const seconds = parseInt(mainPart.substring(12, 14), 10);

        if (
            !isNaN(year) &&
            !isNaN(month) &&
            !isNaN(day) &&
            !isNaN(hours) &&
            !isNaN(minutes) &&
            !isNaN(seconds)
        ) {
            try {
                return new Date(year, month, day, hours, minutes, seconds);
            } catch {
                return dateTimeStr;
            }
        }
    }

    return dateTimeStr;
}

/**
 * Parse Age String (AS) value
 * Format: nnnD/W/M/Y (days/weeks/months/years)
 */
export function parseAgeString(
    value: string
):
    | { value: number; unit: "D" | "W" | "M" | "Y" }
    | string
    | Array<{ value: number; unit: "D" | "W" | "M" | "Y" } | string> {
    if (!value || typeof value !== "string") {
        return value;
    }

    const ages = value.split("\\");
    if (ages.length === 1) {
        return parseSingleAge(ages[0]!);
    }

    return ages.map(a => parseSingleAge(a));
}

function parseSingleAge(
    ageStr: string
): { value: number; unit: "D" | "W" | "M" | "Y" } | string {
    const match = ageStr.match(/^(\d{3})([DWMY])$/);
    if (match) {
        const value = parseInt(match[1]!, 10);
        const unit = match[2]! as "D" | "W" | "M" | "Y";
        if (!isNaN(value)) {
            return { value, unit };
        }
    }

    return ageStr;
}

/**
 * Parse value based on VR type
 */
export function parseValueByVR(
    vr: string,
    value: string | number | Array<string | number>
):
    | string
    | number
    | Array<string | number>
    | Record<string, unknown>
    | Date
    | Array<Date | string> {
    if (typeof value === "number" || Array.isArray(value)) {
        return value;
    }

    if (typeof value !== "string") {
        return value as string;
    }

    switch (vr) {
        case "PN":
            return parsePersonName(value);
        case "DA": {
            const parsed = parseDate(value);
            // Convert arrays to first element or return as-is
            if (Array.isArray(parsed)) {
                return parsed.length > 0 ? parsed[0]! : value;
            }
            return parsed;
        }
        case "TM": {
            const parsed = parseTime(value);
            if (Array.isArray(parsed)) {
                return parsed.length > 0 ? parsed[0]! : value;
            }
            return parsed;
        }
        case "DT": {
            const parsed = parseDateTime(value);
            if (Array.isArray(parsed)) {
                return parsed.length > 0 ? parsed[0]! : value;
            }
            return parsed;
        }
        case "AS": {
            const parsed = parseAgeString(value);
            // Age string can return object or array - convert to Record for compatibility
            if (Array.isArray(parsed)) {
                // Return first element if it's an object, otherwise return as string array
                if (
                    parsed.length > 0 &&
                    typeof parsed[0] === "object" &&
                    parsed[0] !== null
                ) {
                    return parsed[0]! as Record<string, unknown>;
                }
                return parsed.map(p =>
                    typeof p === "object" ? p : String(p)
                ) as Array<string | number>;
            }
            return typeof parsed === "object" && parsed !== null
                ? (parsed as Record<string, unknown>)
                : parsed;
        }
        default:
            return value;
    }
}
