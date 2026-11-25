/**
 * Anonymizer against the PS3.15 Annex E Basic Application Level
 * Confidentiality Profile (Table E.1-1, "Basic Prof." column).
 */
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { anonymize, parse, write } from '../../src/index';
import { BASIC_PROFILE_TABLE } from '../../src/core/anonymizationRules-data';
import { resolveAction } from '../../src/core/anonymizationRules';
import type { DicomDataSet, DicomElement, SequenceItem } from '../../src/core/types';
import { lookupVR } from '../../src/utils/vrDictionary';
import { fixture } from '../helpers/fixtures';

/** 2.25 UIDs (PS3.5 B.2): one decimal integer component, at most 64 chars. */
const UID_2_25 = /^2\.25\.(0|[1-9][0-9]*)$/;

function valueFor(vr: string, i: number): DicomElement['Value'] {
  switch (vr) {
    case 'UI':
      return `1.2.826.0.1.3680043.10.999.${i}`;
    case 'DA':
      return '20260115';
    case 'TM':
      return '093000';
    case 'DT':
      return '20260115093000';
    case 'AS':
      return '045Y';
    case 'DS':
    case 'IS':
      return 7;
    case 'US':
    case 'SS':
    case 'UL':
    case 'SL':
    case 'FL':
    case 'FD':
      return 7;
    case 'SQ':
      return undefined;
    case 'OB':
    case 'OW':
    case 'UN':
      return new Uint8Array([1, 2]);
    default:
      return `IDENTIFYING ${i}`;
  }
}

function element(vr: string, value: DicomElement['Value']): DicomElement {
  return { vr, VR: vr, Value: value, value };
}

function dataset(dict: Record<string, DicomElement>): DicomDataSet {
  return {
    dict,
    elements: dict,
    string: () => undefined,
    uint16: () => undefined,
    int16: () => undefined,
    floatString: () => undefined,
    intString: () => undefined,
  };
}

describe('Anonymizer: PS3.15 Table E.1-1 Basic Profile', () => {
  // Every standard attribute of the table with a value of its VR. Sequences
  // get one item holding an identifying Patient ID (Z/D) and a UID (U).
  const dict: Record<string, DicomElement> = {};
  const vrs: Record<string, string> = {};
  BASIC_PROFILE_TABLE.forEach(([tag], i) => {
    const group = parseInt(tag.slice(1, 5), 16);
    const elementNo = parseInt(tag.slice(5), 16);
    const vr = (lookupVR(group, elementNo) ?? 'LO').slice(0, 2);
    vrs[tag] = vr;
    if (vr === 'SQ') {
      const items: SequenceItem[] = [
        {
          elements: {
            x00081155: element('UI', `1.2.826.0.1.3680043.10.998.${i}`),
            x00100020: element('LO', 'NESTED-ID'),
          },
          normalizedElements: {},
        },
      ];
      dict[tag] = { ...element('SQ', items), items };
    } else {
      dict[tag] = element(vr, valueFor(vr, i));
    }
  });

  const uidMap: Record<string, string> = {};
  const anon = anonymize(dataset(dict), { uidMap });

  it.each(BASIC_PROFILE_TABLE.map(r => [r[0], r[1], r[2]] as const))(
    '%s %s (%s)',
    (tag, profileAction) => {
      const action = resolveAction(profileAction);
      const out = anon.dict[tag];
      const vr = vrs[tag]!;
      switch (action) {
        case 'X':
          expect(out).toBeUndefined();
          break;
        case 'Z':
          expect(out).toBeDefined();
          if (vr === 'SQ') {
            expect(out!.items).toEqual([]);
          } else if (tag === 'x00100010' || tag === 'x00100020') {
            expect(out!.Value).toBe('ANON'); // Z allows a dummy
          } else {
            expect(out!.Value).toBe('');
          }
          break;
        case 'D':
          expect(out).toBeDefined();
          if (vr === 'SQ') {
            // Kept, contents cleaned recursively
            const item = (out!.items as SequenceItem[])[0]!.elements;
            expect(item['x00100020']!.Value).toBe('ANON');
            expect(item['x00081155']!.Value).toMatch(UID_2_25);
          } else {
            expect(out!.Value).not.toEqual(dict[tag]!.Value);
            expect(String(out!.Value).length).toBeGreaterThan(0);
          }
          break;
        case 'U':
          expect(out).toBeDefined();
          expect(String(out!.Value)).toMatch(UID_2_25);
          expect(String(out!.Value).length).toBeLessThanOrEqual(64);
          expect(uidMap[String(dict[tag]!.Value)]).toBe(out!.Value);
          break;
        default:
          throw new Error(`Unexpected action ${profileAction}`);
      }
    }
  );

  it('removes Institution Name and replaces Study/Series/SOP Instance UIDs', () => {
    expect(anon.dict['x00080080']).toBeUndefined();
    for (const tag of ['x0020000d', 'x0020000e', 'x00080018', 'x00020003']) {
      expect(String(anon.dict[tag]!.Value)).toMatch(UID_2_25);
      expect(anon.dict[tag]!.Value).not.toBe(dict[tag]!.Value);
    }
  });
});

describe('Anonymizer on parsed files', () => {
  it('de-identifies consistently across instances and nested sequences', () => {
    const pet = parse(new Uint8Array(readFileSync(fixture('PET_SUV.dcm')))) as DicomDataSet;
    const sop = String(pet.dict['x00080018']!.Value);
    const study = String(pet.dict['x0020000d']!.Value);

    // A second instance of the same study that references the first one
    const ref: SequenceItem = {
      elements: {
        x00081150: element('UI', String(pet.dict['x00080016']!.Value)),
        x00081155: element('UI', sop),
      },
      normalizedElements: {},
    };
    const other = dataset({
      x0020000d: element('UI', study),
      x00080018: element('UI', '1.2.826.0.1.3680043.10.999.1'),
      x00080080: element('LO', 'General Hospital'),
      x00081140: { ...element('SQ', [ref]), items: [ref] },
      x00090010: element('LO', 'PRIVATE CREATOR'),
      x00091001: element('LO', 'private value'),
    });

    const uidMap: Record<string, string> = {};
    const a = anonymize(pet, { uidMap });
    const b = anonymize(other, {
      uidMap,
      actionOverrides: { x00081140: 'K' },
    });

    expect(a.dict['x0020000d']!.Value).toBe(b.dict['x0020000d']!.Value);
    const refItems = b.dict['x00081140']!.items as SequenceItem[];
    expect(refItems[0]!.elements['x00081155']!.Value).toBe(a.dict['x00080018']!.Value);
    // SOP Class UID is not an identifier (not in Table E.1-1): kept
    expect(refItems[0]!.elements['x00081150']!.Value).toBe(pet.dict['x00080016']!.Value);
    expect(b.dict['x00080080']).toBeUndefined();
    expect(b.dict['x00090010']).toBeUndefined();
    expect(b.dict['x00091001']).toBeUndefined();

    // The original is untouched and the result can be written and read back
    expect(pet.dict['x00080018']!.Value).toBe(sop);
    const again = parse(write(a, { transferSyntax: pet.transferSyntax })) as DicomDataSet;
    expect(again.dict['x00080018']!.Value).toBe(a.dict['x00080018']!.Value);
    expect(again.dict['x00100010']!.Value).toBe('ANON');
    // Study Date: Z, present with zero length
    expect(again.dict['x00080020']!.length).toBe(0);
    const info = (again.dict['x00540016']!.items as SequenceItem[])[0]!.elements;
    // Radiopharmaceutical Start Time is X in the Basic Profile
    expect(info['x00181072']).toBeUndefined();
  });
});
