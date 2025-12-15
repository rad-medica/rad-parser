import { describe, expect, it } from 'vitest';
import { dicomDictionary, getTagName, isPrivateTag, registerDictionary } from '../../src/utils/dictionary';
import { dicomDictionary as data } from '../../src/utils/dictionary-data';

registerDictionary(data);

describe('dictionary helpers', () => {
  it('resolves known tags and falls back for unknown faces', () => {
    expect(getTagName('x00100010')).toBe("Patient's Name");
    expect(dicomDictionary['7FE00010']).toBe('Pixel Data');
    expect(getTagName('x99999999')).toContain('Unknown Tag');
  });

  it('detects private tags correctly', () => {
    expect(isPrivateTag('x00100010')).toBe(false);
    expect(isPrivateTag('00190010')).toBe(true);
  });
});

