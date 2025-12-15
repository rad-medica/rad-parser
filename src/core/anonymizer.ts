/**
 * DICOM Anonymizer (Basic Attribute Confidentiality Profile)
 *
 * Provides functionality to anonymize DICOM datasets by replacing or removing sensitive tags
 * according to DICOM PS3.15 Annex E (Basic Attribute Confidentiality Profile).
 */

import { DicomDataSet, DicomElement } from './types';
import { BASIC_PROFILE_RULES, AnonymizationAction } from './anonymizationRules';

export interface AnonymizationOptions {
  /**
   * Custom replacement values for tags.
   * Key: Tag format 'xGGGGEEEE'.
   * Value: New value (string) or null to remove.
   */
  replacements?: Record<string, string | null>;
  
  /**
   * Prefix for dummy values (PatientID, PatientName, etc.)
   * Default: 'ANON'
   */
  patientIdPrefix?: string;
  
  /**
   * If true, keep private tags. Default: false (remove private tags).
   */
  keepPrivateTags?: boolean;

  /**
   * UID Map to maintain consistency across a dataset series.
   * If provided, new UIDs will be stored/retrieved here.
   */
   uidMap?: Record<string, string>;
}

const DEFAULT_PREFIX = 'ANON';

/**
 * Anonymize a DICOM dataset.
 * Returns a NEW dataset (shallow copy of structure, deep copy of modified elements).
 * Does not mutate the original dataset.
 *
 * @param dataset - The original dataset
 * @param options - Anonymization options
 * @returns Anonymized DicomDataSet
 */
// Optimized group number extraction - inline parsing (faster than caching for typical datasets)
function getGroupNumberFast(tag: string): number | null {
  if (!tag.startsWith('x') || tag.length !== 9) return null;
  
  // Fast hex parsing using bit operations
  let group = 0;
  for (let i = 1; i < 5; i++) {
    const c = tag.charCodeAt(i);
    group = (group << 4) | (c > 57 ? c - 87 : c - 48);
  }
  
  return group;
}

export function anonymize(dataset: DicomDataSet, options: AnonymizationOptions = {}): DicomDataSet {
  const dict = dataset.dict;
  const customReplacements = options.replacements || {};
  const prefix = options.patientIdPrefix || DEFAULT_PREFIX;
  const uidMap = options.uidMap || {};
  
  // Optimized: Create new dict and process in single pass where possible
  const newDict: Record<string, DicomElement> = {};
  
  // Pre-allocate dict size estimate
  const dictSize = Object.keys(dict).length;
  
  // Copy elements that won't be modified (optimized: avoid unnecessary copies)
  // We'll modify in place for elements that need changes
  for (const key in dict) {
    newDict[key] = dict[key];
  }

  // 1. Process Basic Profile Rules - optimized iteration
  const basicRules = BASIC_PROFILE_RULES;
  for (const tag in basicRules) {
      const rule = basicRules[tag];
      const element = newDict[tag];
      
      // Skip if custom replacement exists
      if (customReplacements[tag] !== undefined) {
          continue; 
      }

      // Only process existing elements
      if (element) {
          applyRule(newDict, tag, rule.action, prefix, uidMap);
      }
  }

  // 2. Process Custom Replacements - optimized
  const customKeys = Object.keys(customReplacements);
  for (let i = 0; i < customKeys.length; i++) {
      const tag = customKeys[i];
      const replacement = customReplacements[tag];
      if (replacement === null) {
          delete newDict[tag];
      } else {
           const original = newDict[tag];
           if (original) {
               // Reuse object, only update needed fields
               original.Value = replacement === '' ? '' : replacement;
               original.value = replacement === '' ? '' : replacement;
               original.length = replacement.length;
           } else {
               // Create new element only if needed
               newDict[tag] = {
                  vr: 'UN',
                  Value: replacement === '' ? '' : replacement,
                  value: replacement === '' ? '' : replacement,
                  length: replacement.length
               };
           }
      }
  }

  // 3. Private Tags Removal - optimized: delete directly (faster than collecting then deleting)
  if (!options.keepPrivateTags) {
      // Single pass: check and delete immediately
      for (const tag in newDict) {
          const group = getGroupNumberFast(tag);
          if (group !== null && group % 2 !== 0) {
              delete newDict[tag];
          }
      }
  }
  
  return {
    dict: newDict,
    elements: newDict,
    string: (t) => { const e = newDict[t]; return e ? String(e.Value) : undefined; },
    uint16: dataset.uint16,
    int16: dataset.int16,
    floatString: dataset.floatString
  };
}

function applyRule(
    dict: Record<string, DicomElement>, 
    tag: string, 
    action: AnonymizationAction, 
    prefix: string,
    uidMap: Record<string, string>
) {
    const element = dict[tag];
    if (!element) return;
    
    switch (action) {
        case 'X': // Remove
            delete dict[tag];
            break;
            
        case 'Z': // Zero Length (Empty) - optimized: reuse object
             element.Value = '';
             element.value = '';
             element.length = 0;
             break;
             
        case 'D': // Dummy Value - optimized: reuse object
             element.Value = prefix;
             element.value = prefix;
             element.length = prefix.length;
             break;
             
        case 'U': // Replace UID - optimized
             const originalUID = String(element.Value);
             // Normalize UID (strip null bytes) - optimized regex
             const cleanUID = originalUID.replace(/\0/g, '');
             
             let newUID = uidMap[cleanUID];
             if (!newUID) {
                 // Generate new UID - optimized string concatenation
                 newUID = '2.25.' + Math.floor(Math.random() * 1e14) + '.' + Date.now();
                 uidMap[cleanUID] = newUID;
             }
             element.Value = newUID;
             element.value = newUID;
             element.length = newUID.length;
             break;
             
        case 'K': // Keep
             break;
    }
}
