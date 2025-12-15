import { describe, expect, it } from 'vitest';
import { detectVR, detectVRForPrivateTag, requiresExplicitLength } from '../../src/utils/vrDetection';

describe('vrDetection helpers', () => {
  it('detects explicit VRs for well-known tags', () => {
    expect(detectVR(0x0010, 0x0010)).toBe('PN');
    expect(detectVR(0x0028, 0x0011)).toBe('US');
    expect(detectVR(0x0002, 0x0010)).toBe('UI');
    expect(detectVR(0x0008, 0x0018)).toBe('UI');
    expect(detectVR(0x7FE0, 0x0010)).toBe('OB');
    expect(detectVR(0xABCD, 0x1234)).toBe('UN');
  });

  it('recognizes VRs that require explicit lengths', () => {
    expect(requiresExplicitLength('OB')).toBe(true);
    expect(requiresExplicitLength('SQ')).toBe(true);
    expect(requiresExplicitLength('PN')).toBe(false);
  });

  it('guesses private tag VRs based on length heuristics', () => {
    expect(detectVRForPrivateTag(0x0029, 0x1010, 0)).toBe('UN');
    expect(detectVRForPrivateTag(0x0029, 0x1010, 2)).toBe('US');
    expect(detectVRForPrivateTag(0x0029, 0x1010, 4)).toBe('UL');
    expect(detectVRForPrivateTag(0x0029, 0x1010, 10)).toBe('LO');
    expect(detectVRForPrivateTag(0x0029, 0x1010, 512)).toBe('OB');
    expect(detectVRForPrivateTag(0x0029, 0x1010, 0xffffffff)).toBe('SQ');
  });
});

