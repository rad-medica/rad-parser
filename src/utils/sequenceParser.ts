/**
 * Sequence Parser: reads a Sequence of Items (PS3.5 7.5) from a SafeDataView.
 *
 * Thin wrapper over the structural reader in core/datasetReader.ts so that
 * nested values are decoded exactly like top-level ones.
 */

import { readSequence, type ReaderContext } from '../core/datasetReader';
import type { SequenceItem } from '../core/types';
import { SafeDataView } from './SafeDataView';

/**
 * Parse a sequence starting at the view's current position (the first Item).
 * With `undefinedLength` the sequence ends at the Sequence Delimitation Item;
 * otherwise items are read until the next non-Item element or end of data.
 * The view is left positioned after what was consumed.
 */
export function parseSequence(
  view: SafeDataView,
  explicitVR: boolean,
  littleEndian: boolean,
  characterSet: string,
  undefinedLength: boolean,
  _enableWasm?: boolean
): SequenceItem[] {
  const dv = view.getDataView();
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  const ctx: ReaderContext = {
    bytes,
    dv,
    explicitVR,
    littleEndian,
    characterSet,
    pixelData: 'view',
  };
  const res = readSequence(ctx, view.getPosition(), bytes.length, undefinedLength, 0, false, false);
  view.setPosition(undefinedLength ? res.next : res.itemsEnd);
  return res.items;
}
