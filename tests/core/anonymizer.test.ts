
import { describe, it, expect } from 'vitest';
import { parse, anonymize } from '../../src/index';

describe('Anonymizer', () => {
    // Create a mock dataset
    const createDataset = () => {
        return {
            dict: {
                'x00100010': { vr: 'PN', Value: 'DOE^JOHN', value: 'DOE^JOHN' }, // PatientName
                'x00100020': { vr: 'LO', Value: '12345', value: '12345' },       // PatientID
                'x00100030': { vr: 'DA', Value: '19800101', value: '19800101' }, // PatientBirthDate
                'x00100040': { vr: 'CS', Value: 'M', value: 'M' },               // PatientSex
                // Private Tag (odd group)
                'x00110010': { vr: 'LO', Value: 'PrivateData', value: 'PrivateData' }
            },
            elements: {}, // Mock alias
            string: (t: string) => undefined,
            uint16: (t: string) => undefined,
            int16: (t: string) => undefined,
            floatString: (t: string) => undefined,
        } as any;
    };


    it('should apply Basic Profile rules (AccessionNumber -> Z, InstitutionName -> X)', () => {
         const dataset = {
            dict: {
                'x00080050': { vr: 'SH', Value: 'ACC123' }, // AccessionNumber (Z - Empty)
                'x00080080': { vr: 'LO', Value: 'Hospital Name' }, // InstitutionName (X - Remove)
                'x00100010': { vr: 'PN', Value: 'DOE^JOHN' }, // PatientName (D - Dummy)
                'x0020000D': { vr: 'UI', Value: '1.2.3.4' } // StudyInstanceUID (U - Replace)
            },
            elements: {},
            string: () => undefined,
            uint16: () => undefined,
            int16: () => undefined,
            floatString: () => undefined,
        } as any;
        
        const anon = anonymize(dataset);
        
        expect(anon.dict['x00080050'].Value).toBe(''); // Z
        expect(anon.dict['x00080080']).toBeUndefined(); // X
        expect(anon.dict['x00100010'].Value).toBe('ANON'); // D (Default prefix)
        expect(anon.dict['x0020000D'].Value).not.toBe('1.2.3.4'); // U (Changed)
        expect(anon.dict['x0020000D'].Value).toMatch(/^2\.25\./); // Check new UID root
    });

    it('should maintain UID consistency with uidMap', () => {
        const dataset1 = { dict: { 'x0020000D': { vr: 'UI', Value: '1.2.3.4' } }, elements: {}, string: ()=>{} } as any;
        const dataset2 = { dict: { 'x0020000D': { vr: 'UI', Value: '1.2.3.4' } }, elements: {}, string: ()=>{} } as any;
        
        const uidMap = {};
        const anon1 = anonymize(dataset1, { uidMap });
        const anon2 = anonymize(dataset2, { uidMap });
        
        expect(anon1.dict['x0020000D'].Value).toBe(anon2.dict['x0020000D'].Value);
    });

    it('should use custom replacements', () => {
        const dataset = createDataset();
        const anon = anonymize(dataset, {
            replacements: {
                'x00100010': 'SMITH^JANE',
                'x00100020': 'ID-999'
            }
        });
        
        expect(anon.dict['x00100010'].Value).toBe('SMITH^JANE');
        expect(anon.dict['x00100020'].Value).toBe('ID-999');
    });

    it('should remove tags if replacement is null', () => {
        const dataset = createDataset();
        const anon = anonymize(dataset, {
            replacements: {
                'x00100010': null // Remove PatientName
            }
        });
        
        expect(anon.dict['x00100010']).toBeUndefined();
    });

    it('should remove private tags by default', () => {
        const dataset = createDataset();
        const anon = anonymize(dataset);
        
        expect(anon.dict['x00110010']).toBeUndefined();
    });

    it('should keep private tags if requested', () => {
        const dataset = createDataset();
        const anon = anonymize(dataset, { keepPrivateTags: true });
        
        expect(anon.dict['x00110010']).toBeDefined();
        expect(anon.dict['x00110010'].Value).toBe('PrivateData');
    });
});

