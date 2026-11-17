#!/usr/bin/env python3
"""Generate src/utils/vrDictionary-data.ts from DICOM PS3.6 (DocBook XML).

Usage:
    curl -sSO https://dicom.nema.org/medical/dicom/current/source/docbook/part06/part06.xml
    python3 scripts/generate_vr_dictionary.py part06.xml > src/utils/vrDictionary-data.ts

Reads Tables 6-1 (Registry of DICOM Data Elements), 7-1 (File Meta Elements),
8-1 (Directory Structuring Elements) and 9-1 (Dynamic RTP Payload Elements).
The VR column is copied verbatim; multi-valued VRs ("US or SS") are kept as
"US|SS" so the reader can resolve them from context (PS3.5 Annex A.1).
"""
import sys
import xml.etree.ElementTree as ET

D = "{http://docbook.org/ns/docbook}"
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"
TABLES = ("table_6-1", "table_7-1", "table_8-1", "table_9-1")


def text(e):
    return " ".join("".join(e.itertext()).split()).replace("​", "")


root = ET.parse(sys.argv[1]).getroot()
subtitle = text(root.find(D + "subtitle"))
exact = {}
masked = []
for tab in root.iter(D + "table"):
    if tab.get(XML_ID) not in TABLES:
        continue
    for tr in tab.iter(D + "tr"):
        tds = tr.findall(D + "td")
        if len(tds) < 5:
            continue
        tag = text(tds[0]).strip("()").replace(",", "").upper()
        vr = text(tds[3]).replace(" or ", "|")
        if len(tag) != 8 or not vr or not vr[:2].isalpha() or "Note" in vr:
            continue
        if "X" in tag:
            mask = int("".join("0" if c == "X" else "F" for c in tag), 16)
            value = int(tag.replace("X", "0"), 16)
            masked.append((mask, value, vr))
        else:
            exact[tag] = vr

lines = [
    "/**",
    f" * VR registry generated from {subtitle}, Tables 6-1, 7-1, 8-1 and 9-1.",
    " * Do not edit by hand: run scripts/generate_vr_dictionary.py.",
    " * Multiple VRs (\"US or SS\") are encoded as \"US|SS\".",
    " */",
    "",
    "/** Packed entries: 8 hex digits (group+element) followed by the VR, separated by ';'. */",
    "export const VR_REGISTRY_PACKED =",
]
packed = ";".join(f"{t}{v}" for t, v in sorted(exact.items()))
chunks = [packed[i:i + 76] for i in range(0, len(packed), 76)]
for i, c in enumerate(chunks):
    lines.append(f'    "{c}"' + (" +" if i < len(chunks) - 1 else ";"))
lines.append("")
lines.append("/** Repeating-group entries: [mask, value, VR]; match when (tag & mask) === value. */")
lines.append("export const VR_REGISTRY_MASKED: ReadonlyArray<readonly [number, number, string]> = [")
for m, v, vr in masked:
    lines.append(f'    [0x{m:08x}, 0x{v:08x}, "{vr}"],')
lines.append("];")
print("\n".join(lines))
