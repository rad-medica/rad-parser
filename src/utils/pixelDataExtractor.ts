/**
 * Extract and rescale pixel data to Float32Array
 * 
 * This utility extracts pixel data from a DICOM dataset, automatically decodes
 * compressed data using the appropriate codec, and applies rescale slope/intercept
 * to produce normalized Float32 values.
 * 
 * @param dataset - Parsed DICOM dataset
 * @returns Float32Array with rescaled pixel values
 */

import type { DicomDataSet } from '../core/types';

export function extractRescaledPixelData(dataset: DicomDataSet): Float32Array {
  // Get rescale parameters (default to y = x if not present)
  const rescaleSlope = dataset.floats('x00281053')?.[0] ?? 1.0;
  const rescaleIntercept = dataset.floats('x00281052')?.[0] ?? 0.0;
  
  // Get pixel data dimensions
  const rows = dataset.uint16('x00280010') ?? 0;
  const columns = dataset.uint16('x00280011') ?? 0;
  const numberOfFrames = dataset.uint16('x00280008') ?? 1;
  const bitsAllocated = dataset.uint16('x00280100') ?? 16;
  const pixelRepresentation = dataset.uint16('x00280103') ?? 0; // 0 = unsigned, 1 = signed
  
  if (rows === 0 || columns === 0) {
    throw new Error('Invalid image dimensions: rows and columns must be > 0');
  }
  
  const totalPixels = rows * columns * numberOfFrames;
  
  // Extract raw pixel data based on bits allocated
  let pixelData: Uint8Array | Uint16Array | Int16Array;
  
  if (bitsAllocated === 8) {
    pixelData = dataset.uint8('x7fe00010') ?? new Uint8Array(0);
  } else if (bitsAllocated === 16) {
    if (pixelRepresentation === 1) {
      // Signed 16-bit
      const raw = dataset.uint8('x7fe00010');
      if (!raw) {
        throw new Error('Pixel data not found');
      }
      pixelData = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    } else {
      // Unsigned 16-bit
      const raw = dataset.uint8('x7fe00010');
      if (!raw) {
        throw new Error('Pixel data not found');
      }
      pixelData = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    }
  } else {
    throw new Error(`Unsupported bits allocated: ${bitsAllocated}. Only 8 and 16 are supported.`);
  }
  
  if (pixelData.length === 0) {
    throw new Error('Pixel data is empty');
  }
  
  // Ensure we have the expected number of pixels
  const expectedLength = Math.min(totalPixels, pixelData.length);
  
  // Create output Float32Array
  const output = new Float32Array(expectedLength);
  
  // Apply rescale transformation: rescaled = stored * slope + intercept
  for (let i = 0; i < expectedLength; i++) {
    const storedValue = pixelData[i];
    output[i] = storedValue * rescaleSlope + rescaleIntercept;
  }
  
  return output;
}
