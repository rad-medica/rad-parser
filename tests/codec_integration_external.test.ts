import { describe, it, expect, vi } from 'vitest';
import { registry, Jpeg2000Decoder } from '../src/index';

/**
 * These tests validate external codec integration paths:
 * - Functional codec registration
 * - Priority handling
 * - isSupported fallback
 * - Error propagation from external decoders
 */
describe('External codec integration', () => {
  it('prefers custom functional codec for JPEG 2000', async () => {
    const decodeCustom = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const decodeDefault = vi.fn().mockResolvedValue(new Uint8Array([9]));

    const testRegistry = new (registry.constructor as any)();
    testRegistry.registerFunctional({
      name: 'custom-j2k',
      transferSyntaxes: ['1.2.840.10008.1.2.4.91'],
      priority: 500,
      decode: decodeCustom,
    });
    testRegistry.register(new Jpeg2000Decoder(decodeDefault)); // lower priority than custom

    const decoder = await testRegistry.getDecoder('1.2.840.10008.1.2.4.91');
    expect(decoder?.name).toBe('custom-j2k');

    const out = await decoder?.decode([new Uint8Array([0xaa])], {});
    expect(decodeCustom).toHaveBeenCalledTimes(1);
    expect(out).toEqual(new Uint8Array([1, 2, 3]));
    expect(decodeDefault).not.toHaveBeenCalled();
  });

  it('falls back when highest priority codec is unsupported', async () => {
    const decodeSupported = vi.fn().mockResolvedValue(new Uint8Array([7, 7]));

    const testRegistry = new (registry.constructor as any)();
    testRegistry.registerFunctional({
      name: 'unsupported-codec',
      transferSyntaxes: ['1.2.840.10008.1.2.4.91'],
      priority: 600,
      isSupported: () => false,
      decode: vi.fn(),
    });
    testRegistry.registerFunctional({
      name: 'fallback-codec',
      transferSyntaxes: ['1.2.840.10008.1.2.4.91'],
      priority: 400,
      decode: decodeSupported,
    });

    const decoder = await testRegistry.getDecoder('1.2.840.10008.1.2.4.91');
    expect(decoder?.name).toBe('fallback-codec');

    const out = await decoder?.decode([new Uint8Array([0xbb])], {});
    expect(decodeSupported).toHaveBeenCalledTimes(1);
    expect(out).toEqual(new Uint8Array([7, 7]));
  });

  it('propagates decode errors from external codec', async () => {
    const decodeFail = vi.fn().mockRejectedValue(new Error('decode failed'));

    const testRegistry = new (registry.constructor as any)();
    testRegistry.registerFunctional({
      name: 'failing-codec',
      transferSyntaxes: ['1.2.840.10008.1.2.4.91'],
      priority: 300,
      decode: decodeFail,
    });

    const decoder = await testRegistry.getDecoder('1.2.840.10008.1.2.4.91');
    expect(decoder?.name).toBe('failing-codec');

    await expect(decoder?.decode([new Uint8Array([0xcc])], {})).rejects.toThrow(
      'decode failed',
    );
    expect(decodeFail).toHaveBeenCalledTimes(1);
  });
});

