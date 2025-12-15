import { describe, expect, it } from 'vitest';
import { SafeDataView } from '../../src/utils/SafeDataView';

describe('SafeDataView', () => {
  it('reads little-endian integers and enforces bounds', () => {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint16(0, 0x1234, true); // little endian
    view.setUint16(2, 0xABCD, false); // big endian

    const safe = new SafeDataView(buffer);
    expect(safe.readUint16()).toBe(0x1234);

    safe.setEndianness(false); // switch to big endian for the next read
    expect(safe.readUint16()).toBe(0xABCD);
    expect(safe.getPosition()).toBe(4);

    expect(() => safe.readUint32()).toThrow('Read beyond buffer');
    expect(() => safe.setPosition(-1)).toThrow('out of bounds');
  });

  it('trims null terminators and spaces when reading strings', () => {
    const text = new TextEncoder().encode('Test  \0\0');
    const safe = new SafeDataView(text.buffer);
    const str = safe.readString(text.length);
    expect(str).toBe('Test');
  });
});

