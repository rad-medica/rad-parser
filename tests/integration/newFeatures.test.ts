
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parse, extractPixelData } from '../../src/index';

const testFile = path.resolve(__dirname, '../test_data/patient/DICOM/18CBDD76');

describe('New Parser Features', () => {
    let dicomBytes: Uint8Array;

    const loadDicom = () => {
        if (!dicomBytes) {
            if (fs.existsSync(testFile)) {
                dicomBytes = new Uint8Array(fs.readFileSync(testFile));
            } else {
                 // Fallback or skip if file doesn't exist (though it should in this env)
                 throw new Error('Test file not found');
            }
        }
    };

    it('shallowParse should return a map of tags without values', () => {
        loadDicom();
        const result = parse(dicomBytes, { type: 'shallow' });
        
        expect(result).toBeDefined();
        // Check for specific tag (e.g. PatientName 0010,0010)
        expect(result['x00100010']).toBeDefined();
        expect(result['x00100010'].vr).toBe('PN');
        expect(result['x00100010'].length).toBeGreaterThan(0);
        expect(result['x00100010'].dataOffset).toBeGreaterThan(0);
        
        // Should not have 'Value' or 'value'
        expect((result['x00100010'] as any).Value).toBeUndefined();
    });

    it('mediumParse should parse everything but skip PixelData value', () => {
        loadDicom();
        const dataset = parse(dicomBytes, { type: 'light' });
        
        expect(dataset).toBeDefined();
        expect(dataset.string('0010,0010')).toBeDefined(); // PatientName
        
        // Pixel Data (7FE0,0010) should be present but empty/undefined value
        const pixelDataElem = dataset.elements['x7fe00010'];
        expect(pixelDataElem).toBeDefined();
        // Value should be undefined as per our implementation
        expect(pixelDataElem.Value).toBeUndefined();
        expect(pixelDataElem.value).toBeUndefined();
    });

    it('extractPixelData should return pixel data buffer', () => {
        loadDicom();
        const pixelData = extractPixelData(dicomBytes);
        
        expect(pixelData).toBeDefined();
        expect(pixelData?.pixelData).toBeInstanceOf(Uint8Array);
        expect(pixelData?.pixelData.length).toBeGreaterThan(0);
    });
});

