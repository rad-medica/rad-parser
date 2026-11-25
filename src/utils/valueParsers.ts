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
  if (!value || typeof value !== 'string') {
    return { Alphanumeric: value };
  }

  // PN can have multiple components separated by =
  // Each component is: Family^Given^Middle^Prefix^Suffix
  const components = value.split('=');
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
    const parts = components[0].split('^');
    result.family = parts[0] || '';
    result.given = parts[1] || '';
    result.middle = parts[2] || '';
    result.prefix = parts[3] || '';
    result.suffix = parts[4] || '';
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

/** Components of a DA value (PS3.5 Table 6.2-1). Month and day are 1-based. */
export interface DicomDateParts {
  year: number;
  month: number;
  day: number;
}

/** Components of a TM value; absent components were not stored. */
export interface DicomTimeParts {
  hours: number;
  minutes?: number;
  seconds?: number;
  /** Fractional second digits as stored, e.g. "5" or "123456". */
  fraction?: string;
}

/** Components of a DT value; absent components were not stored. */
export interface DicomDateTimeParts extends Partial<DicomTimeParts> {
  year: number;
  month?: number;
  day?: number;
  /** UTC offset as stored ("+HHMM" / "-HHMM"), when present. */
  utcOffset?: string;
}

function splitValues<T>(
  value: string,
  one: (v: string) => T | string
): T | string | Array<T | string> {
  if (!value || typeof value !== 'string') {
    return value;
  }
  const parts = value.split('\\');
  return parts.length === 1 ? one(parts[0]!.trim()) : parts.map(p => one(p.trim()));
}

/**
 * Parse Date (DA): "YYYYMMDD" (and the retired "YYYY.MM.DD").
 * Returns the stored components; nothing is converted to a JS Date, so no
 * time zone or time of day is assumed. Invalid text is returned unchanged.
 */
export function parseDate(value: string): DicomDateParts | string | Array<DicomDateParts | string> {
  return splitValues(value, parseSingleDate);
}

function parseSingleDate(dateStr: string): DicomDateParts | string {
  const m = /^(\d{4})\.?(\d{2})\.?(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return dateStr;
  return { year, month, day };
}

/**
 * Parse Time (TM): "HH[MM[SS[.F{1-6}]]]" (and the retired "HH:MM:SS").
 * Returns the stored components only; no date is attached.
 */
export function parseTime(value: string): DicomTimeParts | string | Array<DicomTimeParts | string> {
  return splitValues(value, parseSingleTime);
}

function parseSingleTime(timeStr: string): DicomTimeParts | string {
  const m = /^(\d{2})(?::?(\d{2})(?::?(\d{2})(?:\.(\d{1,6}))?)?)?$/.exec(timeStr);
  if (!m) return timeStr;
  const out: DicomTimeParts = { hours: Number(m[1]) };
  if (m[2] !== undefined) out.minutes = Number(m[2]);
  if (m[3] !== undefined) out.seconds = Number(m[3]);
  if (m[4] !== undefined) out.fraction = m[4];
  if (out.hours > 23 || (out.minutes ?? 0) > 59 || (out.seconds ?? 0) > 60) {
    return timeStr;
  }
  return out;
}

/**
 * Parse Date Time (DT): "YYYY[MM[DD[HH[MM[SS[.F{1-6}]]]]]][&ZZXX]".
 * Returns the stored components and UTC offset; no time zone is assumed
 * when the offset is absent.
 */
export function parseDateTime(
  value: string
): DicomDateTimeParts | string | Array<DicomDateTimeParts | string> {
  return splitValues(value, parseSingleDateTime);
}

function parseSingleDateTime(dateTimeStr: string): DicomDateTimeParts | string {
  const m = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.(\d{1,6}))?([+-]\d{4})?$/.exec(
    dateTimeStr
  );
  if (!m) return dateTimeStr;
  const out: DicomDateTimeParts = { year: Number(m[1]) };
  const keys = ['month', 'day', 'hours', 'minutes', 'seconds'] as const;
  keys.forEach((k, i) => {
    const v = m[i + 2];
    if (v !== undefined) out[k] = Number(v);
  });
  if (m[7] !== undefined) out.fraction = m[7];
  if (m[8] !== undefined) out.utcOffset = m[8];
  return out;
}

/**
 * Parse Age String (AS) value
 * Format: nnnD/W/M/Y (days/weeks/months/years)
 */
export function parseAgeString(
  value: string
):
  | { value: number; unit: 'D' | 'W' | 'M' | 'Y' }
  | string
  | Array<{ value: number; unit: 'D' | 'W' | 'M' | 'Y' } | string> {
  if (!value || typeof value !== 'string') {
    return value;
  }

  const ages = value.split('\\');
  if (ages.length === 1) {
    return parseSingleAge(ages[0]!);
  }

  return ages.map(a => parseSingleAge(a));
}

function parseSingleAge(ageStr: string): { value: number; unit: 'D' | 'W' | 'M' | 'Y' } | string {
  const match = ageStr.match(/^(\d{3})([DWMY])$/);
  if (match) {
    const value = parseInt(match[1]!, 10);
    const unit = match[2]! as 'D' | 'W' | 'M' | 'Y';
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
  | DicomDateParts
  | DicomTimeParts
  | DicomDateTimeParts
  | Array<Record<string, unknown> | string> {
  if (typeof value === 'number' || Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return value as string;
  }

  switch (vr) {
    case 'PN':
      return parsePersonName(value);
    case 'DA': {
      const parsed = parseDate(value);
      // Convert arrays to first element or return as-is
      if (Array.isArray(parsed)) {
        return parsed.length > 0 ? parsed[0]! : value;
      }
      return parsed;
    }
    case 'TM': {
      const parsed = parseTime(value);
      if (Array.isArray(parsed)) {
        return parsed.length > 0 ? parsed[0]! : value;
      }
      return parsed;
    }
    case 'DT': {
      const parsed = parseDateTime(value);
      if (Array.isArray(parsed)) {
        return parsed.length > 0 ? parsed[0]! : value;
      }
      return parsed;
    }
    case 'AS': {
      const parsed = parseAgeString(value);
      // Age string can return object or array - convert to Record for compatibility
      if (Array.isArray(parsed)) {
        // Return first element if it's an object, otherwise return as string array
        if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
          return parsed[0]! as Record<string, unknown>;
        }
        return parsed.map(p => (typeof p === 'object' ? p : String(p))) as Array<string | number>;
      }
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : parsed;
    }
    default:
      return value;
  }
}
