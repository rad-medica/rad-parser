
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebGpuDecoder } from '../../src/codecs/webgpu';

describe('WebGpuDecoder', () => {
  let originalNavigator: any;

  beforeEach(() => {
    // Save original navigator if exists (Node might fail accessing global.navigator directly if strictly undefined, but global usually has it as undefined)
    try {
        originalNavigator = global.navigator;
    } catch {
        originalNavigator = undefined;
    }
  });

  afterEach(() => {
    global.navigator = originalNavigator;
    vi.restoreAllMocks();
  });

  it('should report not supported if navigator is undefined', async () => {
    // @ts-ignore
    delete global.navigator;
    const decoder = new WebGpuDecoder();
    expect(await decoder.isSupported()).toBe(false);
  });

  it('should report not supported if navigator.gpu is undefined', async () => {
    global.navigator = {} as any;
    const decoder = new WebGpuDecoder();
    expect(await decoder.isSupported()).toBe(false);
  });

  it('should report supported if navigator.gpu exists', async () => {
    global.navigator = {
        gpu: {
            requestAdapter: vi.fn().mockResolvedValue({
                requestDevice: vi.fn().mockResolvedValue({})
            }),
        }
    } as any;
    const decoder = new WebGpuDecoder();
    expect(await decoder.isSupported()).toBe(true);
  });

  it('canDecode should return true for supported transfer syntaxes', async () => {
      const decoder = new WebGpuDecoder();
      // Mock support
      global.navigator = { gpu: {} } as any; 
      // canDecode might check isSupported internally? 
      // Checking source: it usually checks logic.
      
      const ts = '1.2.840.10008.1.2.4.50'; // JPEG Baseline
      expect(await decoder.canDecode(ts)).toBe(true);
  });
});

