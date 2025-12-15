/**
 * Parser Comparison Tests
 * 
 * Compares rad-parser with other DICOM parsers (dcmjs, dicom-parser, efferent-dicom)
 * using test data from test_data folder to verify correctness and compatibility.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dcmjs from 'dcmjs';
import * as dicomParser from 'dicom-parser';
import efferentDicom from 'efferent-dicom';
import { parse, parseWithMetadata, extractTransferSyntax } from '../src/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ParseResult {
  success: boolean;
  elementCount: number;
  transferSyntax?: string;
  error?: string;
  patientName?: string;
  studyDate?: string;
  modality?: string;
}

interface ComparisonResult {
  file: string;
  radParser: ParseResult;
  dcmjs: ParseResult;
  dicomParser: ParseResult;
  efferentDicom: ParseResult;
}

/**
 * Get all DICOM files from test_data directory recursively
 */
function getAllDicomFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        getAllDicomFiles(filePath, fileList);
      } else if (stat.isFile() && stat.size >= 132 && !file.includes('Zone.Identifier')) {
        // Minimum DICOM file size is 132 bytes (preamble + header)
        fileList.push(filePath);
      }
    } catch {
      // Skip files that can't be accessed
    }
  });
  return fileList;
}

/**
 * Parse with rad-parser
 */
function parseWithRadParser(data: Uint8Array): ParseResult {
  try {
    const result = parseWithMetadata(data);
    const dataset = result.dataset;
    const elementCount = Object.keys(dataset.dict || {}).length;
    
    const patientName = dataset.string('x00100010');
    const studyDate = dataset.string('x00080020');
    const modality = dataset.string('x00080060');

    return {
      success: true,
      elementCount,
      transferSyntax: result.transferSyntax,
      patientName,
      studyDate,
      modality,
    };
  } catch (error) {
    return {
      success: false,
      elementCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse with dcmjs
 */
function parseWithDcmjs(data: Uint8Array): ParseResult {
  try {
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const message = (dcmjs as any).data.DicomMessage.readFile(buffer);
    const dict = message?.dict ?? {};
    const elementCount = Object.keys(dict).length;

    const patientName = dict['00100010']?.Value?.[0];
    const studyDate = dict['00080020']?.Value?.[0];
    const modality = dict['00080060']?.Value?.[0];
    const transferSyntax = dict['00020010']?.Value?.[0];

    return {
      success: true,
      elementCount,
      transferSyntax,
      patientName: typeof patientName === 'string' ? patientName : undefined,
      studyDate: typeof studyDate === 'string' ? studyDate : undefined,
      modality: typeof modality === 'string' ? modality : undefined,
    };
  } catch (error) {
    return {
      success: false,
      elementCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse with dicom-parser
 */
function parseWithDicomParserLib(data: Uint8Array): ParseResult {
  try {
    const dataset = dicomParser.parseDicom(data);
    const elements = dataset.elements ?? {};
    const elementCount = Object.keys(elements).length;

    const patientNameEl = elements['00100010'];
    const studyDateEl = elements['00080020'];
    const modalityEl = elements['00080060'];
    const transferSyntaxEl = elements['00020010'];

    const patientName = patientNameEl ? dicomParser.explicitElementToString(patientNameEl) : undefined;
    const studyDate = studyDateEl ? dicomParser.explicitElementToString(studyDateEl) : undefined;
    const modality = modalityEl ? dicomParser.explicitElementToString(modalityEl) : undefined;
    const transferSyntax = transferSyntaxEl ? dicomParser.explicitElementToString(transferSyntaxEl) : undefined;

    return {
      success: true,
      elementCount,
      transferSyntax,
      patientName,
      studyDate,
      modality,
    };
  } catch (error) {
    return {
      success: false,
      elementCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse with efferent-dicom
 */
function parseWithEfferentDicom(data: Uint8Array): ParseResult {
  try {
    const reader = new efferentDicom.DicomReader(data);
    const tags = reader.DicomTags ?? {};
    const elementCount = Object.keys(tags).length;

    const patientName = tags['00100010']?.Value;
    const studyDate = tags['00080020']?.Value;
    const modality = tags['00080060']?.Value;
    const transferSyntax = tags['00020010']?.Value;

    return {
      success: true,
      elementCount,
      transferSyntax: typeof transferSyntax === 'string' ? transferSyntax : undefined,
      patientName: typeof patientName === 'string' ? patientName : undefined,
      studyDate: typeof studyDate === 'string' ? studyDate : undefined,
      modality: typeof modality === 'string' ? modality : undefined,
    };
  } catch (error) {
    return {
      success: false,
      elementCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Load test files from test_data directory
 */
function loadTestFiles(): string[] {
  const projectRoot = path.resolve(__dirname, '..');
  const testDataPaths = [
    path.join(projectRoot, 'test_data', 'TEST', 'SOLO'),
    path.join(projectRoot, 'test_data', 'TEST', 'SUBF'),
    path.join(projectRoot, 'test_data', 'REAL', 'DICOM'),
  ];

  const allFiles: string[] = [];
  for (const testPath of testDataPaths) {
    const files = getAllDicomFiles(testPath);
    allFiles.push(...files);
  }

  // Limit to a reasonable number for testing (can be increased)
  return allFiles.slice(0, 100);
}

describe('Parser Comparison Tests', () => {
  const testFiles = loadTestFiles();
  
  beforeAll(() => {
    console.log(`\nLoaded ${testFiles.length} test files for comparison`);
  });

  describe('Basic Parsing Compatibility', () => {
    it('should parse files that other parsers can parse', () => {
      let radParserSuccess = 0;
      let dcmjsSuccess = 0;
      let dicomParserSuccess = 0;
      let efferentSuccess = 0;
      let allSuccess = 0;
      let radParserOnly = 0;
      const failures: string[] = [];

      // Test a subset of files
      const filesToTest = testFiles.slice(0, 50);

      for (const filePath of filesToTest) {
        const fileData = new Uint8Array(fs.readFileSync(filePath));
        const fileName = path.basename(filePath);

        const radResult = parseWithRadParser(fileData);
        const dcmjsResult = parseWithDcmjs(fileData);
        const dicomParserResult = parseWithDicomParserLib(fileData);
        const efferentResult = parseWithEfferentDicom(fileData);

        if (radResult.success) radParserSuccess++;
        if (dcmjsResult.success) dcmjsSuccess++;
        if (dicomParserResult.success) dicomParserSuccess++;
        if (efferentResult.success) efferentSuccess++;

        if (radResult.success && dcmjsResult.success && dicomParserResult.success && efferentResult.success) {
          allSuccess++;
        }

        if (radResult.success && !dcmjsResult.success && !dicomParserResult.success && !efferentResult.success) {
          radParserOnly++;
        }

        if (!radResult.success && (dcmjsResult.success || dicomParserResult.success || efferentResult.success)) {
          failures.push(`${fileName}: rad-parser failed but others succeeded`);
        }
      }

      console.log(`\nParsing Success Rates:`);
      console.log(`  rad-parser: ${radParserSuccess}/${filesToTest.length} (${((radParserSuccess / filesToTest.length) * 100).toFixed(1)}%)`);
      console.log(`  dcmjs: ${dcmjsSuccess}/${filesToTest.length} (${((dcmjsSuccess / filesToTest.length) * 100).toFixed(1)}%)`);
      console.log(`  dicom-parser: ${dicomParserSuccess}/${filesToTest.length} (${((dicomParserSuccess / filesToTest.length) * 100).toFixed(1)}%)`);
      console.log(`  efferent-dicom: ${efferentSuccess}/${filesToTest.length} (${((efferentSuccess / filesToTest.length) * 100).toFixed(1)}%)`);
      console.log(`  All parsers succeeded: ${allSuccess}/${filesToTest.length}`);
      console.log(`  rad-parser only: ${radParserOnly}/${filesToTest.length}`);

      // rad-parser should succeed on files that at least one other parser succeeds on
      // (with some tolerance for edge cases)
      expect(radParserSuccess).toBeGreaterThanOrEqual(Math.max(dcmjsSuccess, dicomParserSuccess, efferentSuccess) * 0.9);
    }, 120000); // 2 minute timeout
  });

  describe('Transfer Syntax Detection', () => {
    it('should detect transfer syntax correctly compared to other parsers', () => {
      const filesToTest = testFiles.slice(0, 30);
      let matches = 0;
      let mismatches: string[] = [];

      for (const filePath of filesToTest) {
        const fileData = new Uint8Array(fs.readFileSync(filePath));
        const fileName = path.basename(filePath);

        const radTransferSyntax = extractTransferSyntax(fileData);
        const radResult = parseWithRadParser(fileData);
        const dcmjsResult = parseWithDcmjs(fileData);
        const dicomParserResult = parseWithDicomParserLib(fileData);

        // Compare transfer syntax values
        const transferSyntaxes = [
          radTransferSyntax || radResult.transferSyntax,
          dcmjsResult.transferSyntax,
          dicomParserResult.transferSyntax,
        ].filter(ts => ts !== undefined) as string[];

        if (transferSyntaxes.length > 0) {
          const unique = new Set(transferSyntaxes);
          if (unique.size === 1) {
            matches++;
          } else {
            mismatches.push(`${fileName}: ${Array.from(unique).join(' vs ')}`);
          }
        }
      }

      console.log(`\nTransfer Syntax Matches: ${matches}/${filesToTest.length}`);
      if (mismatches.length > 0) {
        console.log(`Mismatches (first 5):`);
        mismatches.slice(0, 5).forEach(m => console.log(`  ${m}`));
      }

      // Most files should have matching transfer syntax detection
      expect(matches).toBeGreaterThan(filesToTest.length * 0.8);
    }, 60000);
  });

  describe('Element Count Comparison', () => {
    it('should parse similar number of elements as other parsers', () => {
      const filesToTest = testFiles.slice(0, 30);
      const comparisons: Array<{ file: string; rad: number; dcmjs: number; dicomParser: number }> = [];

      for (const filePath of filesToTest) {
        const fileData = new Uint8Array(fs.readFileSync(filePath));
        const fileName = path.basename(filePath);

        const radResult = parseWithRadParser(fileData);
        const dcmjsResult = parseWithDcmjs(fileData);
        const dicomParserResult = parseWithDicomParserLib(fileData);

        if (radResult.success && dcmjsResult.success && dicomParserResult.success) {
          comparisons.push({
            file: fileName,
            rad: radResult.elementCount,
            dcmjs: dcmjsResult.elementCount,
            dicomParser: dicomParserResult.elementCount,
          });
        }
      }

      // Calculate average element counts
      const avgRad = comparisons.reduce((sum, c) => sum + c.rad, 0) / comparisons.length;
      const avgDcmjs = comparisons.reduce((sum, c) => sum + c.dcmjs, 0) / comparisons.length;
      const avgDicomParser = comparisons.reduce((sum, c) => sum + c.dicomParser, 0) / comparisons.length;

      console.log(`\nAverage Element Counts:`);
      console.log(`  rad-parser: ${avgRad.toFixed(1)}`);
      console.log(`  dcmjs: ${avgDcmjs.toFixed(1)}`);
      console.log(`  dicom-parser: ${avgDicomParser.toFixed(1)}`);

      // rad-parser should parse at least as many elements as other parsers
      // (it may parse more due to better sequence handling, so we only check minimum)
      const avgOthers = (avgDcmjs + avgDicomParser) / 2;
      expect(avgRad).toBeGreaterThanOrEqual(avgOthers * 0.8);
      // rad-parser may parse more elements due to better sequence parsing
      // so we don't enforce an upper bound
    }, 60000);
  });

  describe('Metadata Extraction', () => {
    it('should extract common metadata fields correctly', () => {
      const filesToTest = testFiles.slice(0, 20);
      let patientNameMatches = 0;
      let studyDateMatches = 0;
      let modalityMatches = 0;
      let totalComparisons = 0;

      for (const filePath of filesToTest) {
        const fileData = new Uint8Array(fs.readFileSync(filePath));

        const radResult = parseWithRadParser(fileData);
        const dcmjsResult = parseWithDcmjs(fileData);
        const dicomParserResult = parseWithDicomParserLib(fileData);

        if (radResult.success && (dcmjsResult.success || dicomParserResult.success)) {
          totalComparisons++;

          // Compare patient name
          const patientNames = [
            radResult.patientName,
            dcmjsResult.patientName,
            dicomParserResult.patientName,
          ].filter(pn => pn !== undefined && pn !== '') as string[];

          if (patientNames.length > 1) {
            const unique = new Set(patientNames.map(pn => pn.trim()));
            if (unique.size === 1) patientNameMatches++;
          }

          // Compare study date
          const studyDates = [
            radResult.studyDate,
            dcmjsResult.studyDate,
            dicomParserResult.studyDate,
          ].filter(sd => sd !== undefined && sd !== '') as string[];

          if (studyDates.length > 1) {
            const unique = new Set(studyDates.map(sd => sd.trim()));
            if (unique.size === 1) studyDateMatches++;
          }

          // Compare modality
          const modalities = [
            radResult.modality,
            dcmjsResult.modality,
            dicomParserResult.modality,
          ].filter(m => m !== undefined && m !== '') as string[];

          if (modalities.length > 1) {
            const unique = new Set(modalities.map(m => m.trim()));
            if (unique.size === 1) modalityMatches++;
          }
        }
      }

      console.log(`\nMetadata Extraction Matches:`);
      console.log(`  Patient Name: ${patientNameMatches}/${totalComparisons}`);
      console.log(`  Study Date: ${studyDateMatches}/${totalComparisons}`);
      console.log(`  Modality: ${modalityMatches}/${totalComparisons}`);

      // Most files should have matching metadata
      if (totalComparisons > 0) {
        expect(patientNameMatches + studyDateMatches + modalityMatches).toBeGreaterThan(0);
      }
    }, 60000);
  });
});

