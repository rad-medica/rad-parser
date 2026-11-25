/**
 * DICOM Basic Application Level Confidentiality Profile (PS3.15 Annex E).
 *
 * The rules come verbatim from Table E.1-1 (anonymizationRules-data.ts).
 * Action codes (PS3.15 Table E.1-1a):
 *   D  replace with a non-zero length dummy value consistent with the VR
 *   Z  replace with a zero length value (or a dummy value consistent with the VR)
 *   X  remove the attribute (a Sequence with all its Items)
 *   K  keep (Sequences are still cleaned recursively)
 *   C  clean: replace with values of similar meaning without identifying information
 *   U  replace with a non-zero length UID, consistent within a set of instances
 *   Z/D, X/Z, X/D, X/Z/D, X/Z/U*  compound: the first action unless a later one
 *        is required for IOD conformance
 *
 * Compound actions need IOD knowledge (Type 1/2/3) this library does not
 * have, so by default the first, most protective action is applied (e.g.
 * Institution Name "X/Z/D" is removed). Override per tag with
 * `AnonymizationOptions.actionOverrides` when an IOD requires otherwise.
 */
import { BASIC_PROFILE_MASKED, BASIC_PROFILE_TABLE } from './anonymizationRules-data';

/** A single resolved action. */
export type AnonymizationAction = 'X' | 'Z' | 'D' | 'U' | 'K' | 'C';

export interface AnonymizationRule {
  tag: string; // xggggeeee (lower case)
  name: string;
  /** Action as listed in Table E.1-1, e.g. "X/Z/D". */
  profileAction: string;
  /** Action applied by default (first of a compound action). */
  action: AnonymizationAction;
}

/** Resolve a Table E.1-1 action code to the action applied by default. */
export function resolveAction(profileAction: string): AnonymizationAction {
  return profileAction.split('/')[0]!.replace('*', '') as AnonymizationAction;
}

export const BASIC_PROFILE_RULES: Record<string, AnonymizationRule> = {};
for (const [tag, profileAction, name] of BASIC_PROFILE_TABLE) {
  BASIC_PROFILE_RULES[tag] = {
    tag,
    name,
    profileAction,
    action: resolveAction(profileAction),
  };
}

/** Rule for a tag ("xggggeeee", any case), including repeating groups. */
export function getProfileRule(tag: string): AnonymizationRule | undefined {
  const key = tag.toLowerCase();
  const rule = BASIC_PROFILE_RULES[key];
  if (rule) return rule;
  if (!/^x[0-9a-f]{8}$/.test(key)) return undefined;
  const num = parseInt(key.slice(1), 16) >>> 0;
  for (const [mask, value, profileAction, name] of BASIC_PROFILE_MASKED) {
    if ((num & mask) >>> 0 === value) {
      return {
        tag: key,
        name,
        profileAction,
        action: resolveAction(profileAction),
      };
    }
  }
  return undefined;
}

// Helper: Check if a tag is a UID tag that needs replacement
export function isUIDTag(tag: string): boolean {
  return getProfileRule(tag)?.action === 'U';
}
