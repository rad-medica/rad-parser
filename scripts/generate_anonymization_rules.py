#!/usr/bin/env python3
"""Generate src/core/anonymizationRules-data.ts from DICOM PS3.15 (DocBook XML).

Usage:
    curl -sSO https://dicom.nema.org/medical/dicom/current/source/docbook/part15/part15.xml
    python3 scripts/generate_anonymization_rules.py part15.xml > src/core/anonymizationRules-data.ts

Copies the "Basic Prof." column of Table E.1-1 (Application Level
Confidentiality Profile Attributes) verbatim, including compound actions such
as "X/Z/D" (resolved at run time, see anonymizationRules.ts).
"""
import json
import sys
import xml.etree.ElementTree as ET

D = "{http://docbook.org/ns/docbook}"
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"


def text(e):
    return " ".join("".join(e.itertext()).split()).replace("​", "")


root = ET.parse(sys.argv[1]).getroot()
subtitle = text(root.find(D + "subtitle"))
table = next(t for t in root.iter(D + "table") if t.get(XML_ID) == "table_E.1-1")
exact = []
masked = []
for tr in table.iter(D + "tr"):
    tds = tr.findall(D + "td")
    if len(tds) < 5:
        continue
    name, tag, action = text(tds[0]), text(tds[1]), text(tds[4])
    tag = tag.strip("()").replace(",", "").upper()
    if len(tag) != 8 or not action:
        continue
    if "X" in tag:
        mask = int("".join("0" if c == "X" else "F" for c in tag), 16)
        value = int(tag.replace("X", "0"), 16)
        masked.append((mask, value, action, name))
    else:
        exact.append(("x" + tag.lower(), action, name))

out = [
    "/**",
    f" * Basic Application Level Confidentiality Profile actions from {subtitle},",
    " * Table E.1-1 (\"Basic Prof.\" column), copied verbatim.",
    " * Do not edit by hand: run scripts/generate_anonymization_rules.py.",
    " */",
    "",
    "/** [tag, action, attribute name] */",
    "export const BASIC_PROFILE_TABLE: ReadonlyArray<readonly [string, string, string]> = [",
]
for tag, action, name in sorted(exact):
    out.append(f'    ["{tag}", "{action}", {json.dumps(name)}],')
out.append("];")
out.append("")
out.append("/** Repeating groups: [mask, value, action, name]; match when (tag & mask) === value. */")
out.append("export const BASIC_PROFILE_MASKED: ReadonlyArray<readonly [number, number, string, string]> = [")
for m, v, action, name in masked:
    out.append(f'    [0x{m:08x}, 0x{v:08x}, "{action}", {json.dumps(name)}],')
out.append("];")
print("\n".join(out))
