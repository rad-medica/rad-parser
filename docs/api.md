# Rad-Parser API Reference

`rad-parser` parses DICOM Part 10 files (and raw Data Sets) in Node.js, Bun,
Deno and browsers with no runtime dependencies. Everything below is exported
from `rad-parser` (and, unless noted, from `rad-parser/core`).

## Installation

```bash
npm install rad-parser
```

## Parsing

### `parse(buffer, options?)`

```typescript
import { parse } from "rad-parser";

const dataset = parse(bytes); // full parse (default)
const name = dataset.string("x00100010");
```

**Parameters**

- `buffer: Uint8Array` (a Node `Buffer` works) — never copied by the parser.
- `options?: UnifiedParseOptions`
    - `type?: "full" | "light" | "shallow" | "fast" | "lazy"` (default `"full"`)
    - `tags?: string | string[]` — keep only these top-level tags
      (`"x00100010"`, `"0010,0010"` or `"00100010"`)
    - `pixelData?: "view" | "copy" | "skip"` — see [Pixel Data](#pixel-data)
    - `pixelDataPlugin?: (element, transferSyntax) => unknown` — called with
      the Pixel Data element; a non-undefined result replaces its value

**Modes**

| Mode      | Returns               | Values                                     | Pixel Data value                |
| --------- | --------------------- | ------------------------------------------ | ------------------------------- |
| `full`    | `DicomDataSet`        | decoded                                    | per `pixelData` (default view)  |
| `light`   | `DicomDataSet`        | decoded                                    | none (locations only)           |
| `shallow` | `ShallowDicomDataSet` | none: `{ vr, length, dataOffset }` per tag | `fragments`, `basicOffsetTable` |
| `fast`    | `ShallowDicomDataSet` | as `shallow`, plus a `tag` field           | as `shallow`                    |
| `lazy`    | `DicomDataSet`        | decoded on first access                    | decoded on access               |

All modes share one structural reader: elements are walked by their encoding
(PS3.5 7.1.2), never by scanning for delimiter byte patterns.

### `parseWithMetadata(buffer, options?)`

Full parse returning `{ dataset, transferSyntax, characterSet }`.
`options: ParseOptions` accepts `skipPixelData`, `pixelData`, `filterTags`
and `pixelDataPlugin`. A raw Data Set without the Part 10 header is accepted:
its encoding is inferred from the first element and reported as Explicit or
Implicit VR Little Endian.

Errors: throws `DicomParseError` when the input is shorter than 8 bytes, the
format cannot be detected, or a deflated Data Set cannot be inflated.
Truncated or malformed data never throws: parsing stops at the first element
that does not fit and returns what was read.

### `parseAndDecode(buffer, options?)`

Full parse, then decodes encapsulated Pixel Data with a registered codec
(see the codec registry). Returns `Promise<DicomDataSet>`.

### `extractPixelData(buffer)`

Returns `PixelDataInfo | null`: `{ pixelData, transferSyntax,
isEncapsulated, fragments? }`. For encapsulated data `pixelData` is the
concatenation of the fragments (Basic Offset Table excluded).

### `extractTransferSyntax(buffer)` / `canParse(buffer)` / `inflateDicom(buffer)`

- `extractTransferSyntax` reads only the File Meta Information.
- `canParse` is a cheap format check.
- `inflateDicom` returns, for Deflated Explicit VR Little Endian files, the
  original header followed by the inflated Data Set — the byte array every
  offset reported for such a file refers to. Other inputs are returned as is.

## Values

`dataset.dict` maps tags (`"xggggeeee"`, lower-case hex) to `DicomElement`:

```typescript
interface DicomElement {
    vr?: string;
    Value?: DicomValue; // also `value`
    length?: number; // 0xFFFFFFFF for undefined length
    dataOffset?: number; // absolute offset of the Value Field
    items?: SequenceItem[]; // sequences: { elements, normalizedElements }
    isEncapsulated?: boolean; // Pixel Data only
    basicOffsetTable?: number[]; // Pixel Data only
    fragments?: { offset: number; length: number }[]; // Pixel Data only
}
```

How each VR is returned (identical at top level and inside sequences):

| VR                                           | Value                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| AE AS CS DA DT LO LT PN SH ST TM UC UI UR UT | string as stored, trailing spaces/NULs removed; multiple values keep the `\` separator |
| DS, IS                                       | `number`, or `Array<number \| string>` for several values (an empty value stays `""`)  |
| US SS UL SL FL FD                            | `number`, or `number[]`                                                                |
| SV UV                                        | `bigint`, or `bigint[]`                                                                |
| AT                                           | `number[]` as `[group, element, ...]`                                                  |
| OB OD OF OL OV OW UN (unknown tag)           | `Uint8Array`                                                                           |
| SQ                                           | `SequenceItem[]`                                                                       |

**Dates and times.** DA, TM and DT are returned exactly as stored (e.g.
Radiopharmaceutical Start Time `"090000"`). Nothing is converted to a JS
`Date`, so no date, time zone or time of day is invented. To split them use
`parseDate`, `parseTime` and `parseDateTime`, which return the stored
components:

```typescript
parseTime("090000.5"); // { hours: 9, minutes: 0, seconds: 0, fraction: "5" }
parseDate("20260115"); // { year: 2026, month: 1, day: 15 }
parseDateTime("20260115093000+0100");
// { year: 2026, month: 1, day: 15, hours: 9, minutes: 30, seconds: 0, utcOffset: "+0100" }
```

Invalid text is returned unchanged. `parsePersonName` and `parseAgeString`
split PN and AS values.

**VR UN (PS3.5 6.2.2).** When an element is stored as UN and its tag is in
the PS3.6 registry, the value is decoded with the registered VR as Implicit
VR Little Endian, whatever the Transfer Syntax (e.g. Rescale Intercept stored
as UN comes back as `vr: "DS"`, `Value: -1024`). A UN of undefined length is
read as an Implicit VR Little Endian sequence. Private and unknown UN
elements stay `Uint8Array`. The VR registry is generated from PS3.6
(`scripts/generate_vr_dictionary.py`) and is also used for Implicit VR.

**Character sets.** Specific Character Set (0008,0005) selects the decoder
for later string values (first value of the attribute).

### `DicomDataSet` accessors

- `string(tag)` — first value as text (PN: the whole value)
- `uint16(tag)`, `int16(tag)`, `floatString(tag)`, `intString(tag)` — first
  numeric value
- `dict` / `elements` — the element map
- `transferSyntax`, `characterSet` — set by `parse`
- `byteArray` (non-enumerable) — the bytes `dataOffset` / `fragments` refer to

## Pixel Data

Viewers usually keep the file and decode frames later. The parser reports
where the Pixel Data is, so nothing has to be copied:

- Native Pixel Data: `dataOffset` and `length` of the Value Field.
- Encapsulated Pixel Data (PS3.5 A.4): `basicOffsetTable` (its entries, may
  be empty) and `fragments` — absolute `offset` (first byte after the 8-byte
  Item header) and `length` of every fragment. `Value` holds the fragments
  only; the Basic Offset Table is not part of it.

`pixelData` option (`full` mode):

- `"view"` (default): `Value` is a zero-copy `subarray` of the input
- `"copy"`: `Value` is an independent copy
- `"skip"`: no `Value`; locations are still reported (same as `light`)

```typescript
const ds = parse(bytes, { type: "full", pixelData: "skip" });
const { fragments, basicOffsetTable } = ds.dict["x7fe00010"];
const first = bytes.subarray(fragments[0].offset, fragments[0].offset + fragments[0].length);
```

For deflated files the offsets refer to `inflateDicom(bytes)` (also
available as `dataset.byteArray`).

### Byte order (Explicit VR Big Endian)

Numeric values are decoded with the file's byte order. Binary word VRs
(OW, OF, OL, OD, OV), Pixel Data included, are returned **byte-swapped to
Little Endian** as a copy (`pixelData: "view"` cannot avoid that copy). OB
and UN values are byte streams and are never swapped. The writer swaps them
back when writing Big Endian.

## Deflated Explicit VR Little Endian

Files with Transfer Syntax 1.2.840.10008.1.2.1.99 (and JPIP Referenced
Deflate, 1.2.840.10008.1.2.4.95) are inflated synchronously by a bundled
RFC 1951 decoder (`src/utils/inflate.ts`), in every runtime, with no
dependency. The writer produces valid deflate streams using stored
(uncompressed) blocks, padded to even length (PS3.5 A.5).

## Writing

### `write(dataset, options?)`

Serializes a `DicomDataSet` as Part 10 (`Uint8Array`). `options.transferSyntax`
defaults to Explicit VR Little Endian; Implicit VR LE, Explicit VR BE,
Deflated Explicit VR LE and encapsulated transfer syntaxes (Pixel Data written
as given, with its Basic Offset Table) are supported. File Meta Information is
regenerated. Sequences are written with undefined length. A value too long for
a 16-bit length field is written as UN (PS3.5 6.2.2). DS numbers are written
within 16 characters.

parse → write → parse keeps every value (checked on all generated files by
`tests/integration/synthetic_evaluator.test.ts`).

## Anonymization

### `anonymize(dataset, options?)`

Applies the Basic Application Level Confidentiality Profile (PS3.15 Annex E,
Table E.1-1, generated by `scripts/generate_anonymization_rules.py`) to the top
level and to every Sequence Item. Returns a new dataset.

- `X` removed, `Z` emptied (Patient's Name / Patient ID get
  `patientIdPrefix`, default `"ANON"`, which Z permits), `D` dummy value
  consistent with the VR, `U` new UID, consistent through `uidMap`.
- Compound actions (`X/Z`, `X/D`, `X/Z/D`, `Z/D`, `X/Z/U*`) need IOD Type
  information the library does not have: the first (most protective) action
  is applied — e.g. Institution Name (`X/Z/D`) is removed. Override per tag
  with `actionOverrides: { x00080080: "Z" }`.
- New UIDs are `2.25.<decimal of a random UUID>` (PS3.5 B.2).
- Private attributes are removed unless `keepPrivateTags: true`.
- `replacements: { tag: value | null }` sets or removes specific tags.

`generateUID()` returns a new 2.25 UID.

## Streaming

`StreamingParser` consumes chunks and calls `onElement({ dict })` per element:

```typescript
import { StreamingParser } from "rad-parser";

const parser = new StreamingParser({
    onElement: ({ dict }) => console.log(dict),
    onError: err => console.error(err),
});
parser.processChunk(chunk1);
parser.processChunk(chunk2);
parser.finalize();
```

`parseFromStream(readableStream, options)` and
`parseFromAsyncIterator(iterable, options)` wrap it. Options:
`onElement`, `onError`, `maxBufferSize` (default 10 MB), `maxIterations`
(default 1000).

## Pixel helpers

### `extractRescaledPixelData(dataset)`

Applies the Modality LUT (Rescale Slope/Intercept) to native 8- or 16-bit
Pixel Data and returns a `Float32Array`. Encapsulated data must be decoded
first (`parseAndDecode`).

## WASM helpers

`initCoreWasm()` loads the optional WASM helpers of `src/core/wasm-opt.ts`
(`parseDSWasm`, `applyModalityLutWasm`, `applyVoiLutWasm`, ...). Parsing does
not need them;
`enableWasm` is accepted for compatibility and has no effect on decoding. The
WASM modules are built with `bun run build:wasm` (Rust,
`wasm32-unknown-unknown`, and `wasm-bindgen-cli` matching `Cargo.lock`).

## Tag formats

All accessors accept `"x00100010"`, `"0010,0010"` and `"00100010"`, in any
letter case.
