import { describe, it, expect, vi } from 'vitest';
import {
  registry,
} from '../src/index';

/**
 * Smoke tests for external cornerstone codecs:
 * - Ensures packages can be imported
 * - Ensures functional codec stubs can be registered and resolved by transfer syntax
 *
 * This does NOT perform real decoding; it validates the integration path.
 */
describe('Cornerstone codecs - import and registry wiring', () => {
  it('imports cornerstone codecs without throwing', async () => {
    // These should resolve if dependencies are installed (package.json)
    const openjpeg = await import('@cornerstonejs/codec-openjpeg');
    const charls = await import('@cornerstonejs/codec-charls');
    const libjpeg = await import('@cornerstonejs/codec-libjpeg-turbo-8bit');

    expect(openjpeg).toBeDefined();
    expect(charls).toBeDefined();
    expect(libjpeg).toBeDefined();
  });

  it('registers functional stubs for cornerstone codecs and resolves by transfer syntax', async () => {
    const testRegistry = new (registry.constructor as any)();

    const decodeJ2K = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const decodeJls = vi.fn().mockResolvedValue(new Uint8Array([2]));
    const decodeJpeg = vi.fn().mockResolvedValue(new Uint8Array([3]));

    // JPEG 2000 (lossless/lossy)
    testRegistry.registerFunctional({
      name: 'cornerstone-openjpeg',
      transferSyntaxes: ['1.2.840.10008.1.2.4.90', '1.2.840.10008.1.2.4.91'],
      priority: 500,
      decode: decodeJ2K,
    });

    // JPEG-LS
    testRegistry.registerFunctional({
      name: 'cornerstone-charls',
      transferSyntaxes: ['1.2.840.10008.1.2.4.80', '1.2.840.10008.1.2.4.81'],
      priority: 500,
      decode: decodeJls,
    });

    // JPEG Baseline/Extended
    testRegistry.registerFunctional({
      name: 'cornerstone-libjpeg',
      transferSyntaxes: ['1.2.840.10008.1.2.4.50', '1.2.840.10008.1.2.4.51'],
      priority: 500,
      decode: decodeJpeg,
    });

    // Resolve and invoke
    const j2kDecoder = await testRegistry.getDecoder('1.2.840.10008.1.2.4.91');
    expect(j2kDecoder?.name).toBe('cornerstone-openjpeg');
    await j2kDecoder?.decode([new Uint8Array([0])], {});
    expect(decodeJ2K).toHaveBeenCalled();

    const jlsDecoder = await testRegistry.getDecoder('1.2.840.10008.1.2.4.80');
    expect(jlsDecoder?.name).toBe('cornerstone-charls');
    await jlsDecoder?.decode([new Uint8Array([0])], {});
    expect(decodeJls).toHaveBeenCalled();

    const jpegDecoder = await testRegistry.getDecoder('1.2.840.10008.1.2.4.50');
    expect(jpegDecoder?.name).toBe('cornerstone-libjpeg');
    await jpegDecoder?.decode([new Uint8Array([0])], {});
    expect(decodeJpeg).toHaveBeenCalled();
  });
});

