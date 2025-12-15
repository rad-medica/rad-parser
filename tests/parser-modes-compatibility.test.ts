import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/index';

/**
 * Comprehensive compatibility test for all parser modes
 * Tests: shallow, full, light, lazy parsers across various DICOM formats
 */

const TEST_DATA_PATHS = [
    'test_data/WG04',
    'test_data/pydicom',
];

function findDicomFiles(dir: string, maxFiles = 10): string[] {
    const files: string[] = [];
    
    try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
            if (files.length >= maxFiles) break;
            
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);
            
            if (stat.isDirectory()) {
                files.push(...findDicomFiles(fullPath, maxFiles - files.length));
            } else if (stat.isFile() && !entry.includes('.json')) {
                files.push(fullPath);
            }
        }
    } catch (e) {
        // Skip if directory doesn't exist
    }
    
    return files.slice(0, maxFiles);
}

describe('Parser Mode Compatibility', () => {
    let testFiles: string[] = [];
    
    // Find test files
    for (const path of TEST_DATA_PATHS) {
        testFiles.push(...findDicomFiles(path, 5));
    }
    
    if (testFiles.length === 0) {
        console.warn('No test files found, skipping compatibility tests');
        return;
    }
    
    console.log(`Testing with ${testFiles.length} DICOM files`);
    
    testFiles.forEach((filePath) => {
        const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
        
        describe(`File: ${fileName}`, () => {
            let fileData: Uint8Array;
            
            test('should load file', () => {
                fileData = new Uint8Array(readFileSync(filePath));
                expect(fileData.length).toBeGreaterThan(0);
            });
            
            test('shallow mode should parse successfully', () => {
                const result = parse(fileData, { type: 'shallow' });
                expect(result).toBeDefined();
                expect(typeof result).toBe('object');
                // Shallow mode returns offset map
                const keys = Object.keys(result);
                expect(keys.length).toBeGreaterThan(0);
            });
            
            test('full mode should parse successfully', () => {
                const result = parse(fileData, { type: 'full' });
                expect(result).toBeDefined();
                expect(result.dict).toBeDefined();
                expect(typeof result.string).toBe('function');
                expect(typeof result.uint16).toBe('function');
            });
            
            test('light mode should parse successfully', () => {
                const result = parse(fileData, { type: 'light' });
                expect(result).toBeDefined();
                expect(result.dict).toBeDefined();
                // Light mode skips pixel data
                expect(typeof result.string).toBe('function');
            });
            
            test('lazy mode should parse successfully', () => {
                const result = parse(fileData, { type: 'lazy' });
                expect(result).toBeDefined();
                expect(result.dict).toBeDefined();
                expect(typeof result.string).toBe('function');
            });
            
            test('all modes should extract same Patient ID', () => {
                const shallow = parse(fileData, { type: 'shallow' });
                const full = parse(fileData, { type: 'full' });
                const light = parse(fileData, { type: 'light' });
                const lazy = parse(fileData, { type: 'lazy' });
                
                // Shallow mode doesn't have accessor methods
                const fullPatientID = full.string('x00100020');
                const lightPatientID = light.string('x00100020');
                const lazyPatientID = lazy.string('x00100020');
                
                // All accessor-based modes should return same value
                if (fullPatientID) {
                    expect(lightPatientID).toBe(fullPatientID);
                    expect(lazyPatientID).toBe(fullPatientID);
                }
            });
            
            test('all modes should handle tag format variations', () => {
                const result = parse(fileData, { type: 'full' });
                
                // Test different tag formats
                const val1 = result.string('x00100020'); // x-prefixed
                const val2 = result.string('0010,0020');  // comma format
                const val3 = result.string('00100020');   // plain hex
                
                // Should all return the same value (or all undefined)
                if (val1) {
                    expect(val2).toBe(val1);
                    expect(val3).toBe(val1);
                }
            });
        });
    });
    
    test('performance: full parse should complete within reasonable time', () => {
        if (testFiles.length === 0) return;
        
        const fileData = new Uint8Array(readFileSync(testFiles[0]));
        const start = performance.now();
        parse(fileData, { type: 'full' });
        const elapsed = performance.now() - start;
        
        // Should parse within 1 second for typical files
        expect(elapsed).toBeLessThan(1000);
    });
    
    test('performance: shallow parse should be faster than full', () => {
        if (testFiles.length === 0) return;
        
        const fileData = new Uint8Array(readFileSync(testFiles[0]));
        
        const shallowStart = performance.now();
        parse(fileData, { type: 'shallow' });
        const shallowTime = performance.now() - shallowStart;
        
        const fullStart = performance.now();
        parse(fileData, { type: 'full' });
        const fullTime = performance.now() - fullStart;
        
        expect(shallowTime).toBeLessThan(fullTime);
    });
});
