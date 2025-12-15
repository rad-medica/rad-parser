import { describe, expect, it } from 'vitest';
import { formatTagWithComma, normalizeTag } from '../../src/utils/tagUtils';

describe('tag utilities', () => {
  it('normalizes tags into x-prefixed format', () => {
    expect(normalizeTag('0010,0010')).toBe('x00100010');
    expect(normalizeTag('x0020000d')).toBe('x0020000d');
    expect(normalizeTag('(0018,0050)')).toBe('x00180050');
  });

  it('formatTagWithComma adds a comma when the clean tag has 8 characters', () => {
    expect(formatTagWithComma('x00100010')).toBe('0010,0010');
    expect(formatTagWithComma('00100010')).toBe('0010,0010');
    expect(formatTagWithComma('x1030')).toBe('1030');
  });
});

