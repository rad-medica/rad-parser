/**
 * Synchronous raw DEFLATE (RFC 1951) decoder and stored-block encoder.
 *
 * Used for the Deflated Explicit VR Little Endian Transfer Syntax
 * (1.2.840.10008.1.2.1.99, PS3.5 A.5), whose Data Set is a raw deflate stream
 * (no zlib or gzip wrapper). It is synchronous so `parse()` stays synchronous in
 * every runtime; it has no dependencies.
 */

/** Length base values for codes 257..285 (RFC 1951 3.2.5). */
const LENGTH_BASE = new Uint16Array([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
]);
const LENGTH_EXTRA = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]);
/** Distance base values for codes 0..29 (RFC 1951 3.2.5). */
const DIST_BASE = new Uint16Array([
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
]);
const DIST_EXTRA = new Uint8Array([
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]);
/** Order of code length code lengths (RFC 1951 3.2.7). */
const CLEN_ORDER = new Uint8Array([
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]);

/** Canonical Huffman table: symbol counts per length and symbols sorted by code. */
interface Huffman {
  counts: Uint16Array;
  symbols: Uint16Array;
}

function buildHuffman(lengths: Uint8Array, n: number): Huffman {
  const counts = new Uint16Array(16);
  const symbols = new Uint16Array(n);
  for (let i = 0; i < n; i++) counts[lengths[i]!]!++;
  counts[0] = 0;
  const offsets = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1]! + counts[i - 1]!;
  for (let i = 0; i < n; i++) {
    const len = lengths[i]!;
    if (len !== 0) symbols[offsets[len]!++] = i;
  }
  return { counts, symbols };
}

const FIXED_LIT: Huffman = (() => {
  const l = new Uint8Array(288);
  l.fill(8, 0, 144);
  l.fill(9, 144, 256);
  l.fill(7, 256, 280);
  l.fill(8, 280, 288);
  return buildHuffman(l, 288);
})();
const FIXED_DIST: Huffman = (() => {
  const l = new Uint8Array(30).fill(5);
  return buildHuffman(l, 30);
})();

class InflateState {
  pos = 0;
  bitBuf = 0;
  bitCount = 0;
  out: Uint8Array;
  outLen = 0;

  constructor(
    readonly src: Uint8Array,
    sizeHint: number
  ) {
    this.out = new Uint8Array(Math.max(1024, sizeHint));
  }

  bits(n: number): number {
    while (this.bitCount < n) {
      if (this.pos >= this.src.length) {
        throw new Error('Deflate stream truncated');
      }
      this.bitBuf |= this.src[this.pos++]! << this.bitCount;
      this.bitCount += 8;
    }
    const v = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>>= n;
    this.bitCount -= n;
    return v;
  }

  ensure(extra: number): void {
    const need = this.outLen + extra;
    if (need <= this.out.length) return;
    let size = this.out.length * 2;
    while (size < need) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.out.subarray(0, this.outLen));
    this.out = grown;
  }

  decodeSymbol(h: Huffman): number {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= this.bits(1);
      const count = h.counts[len]!;
      if (code - count < first) return h.symbols[index + (code - first)]!;
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('Invalid Huffman code in deflate stream');
  }
}

function inflateStored(s: InflateState): void {
  s.bitBuf = 0;
  s.bitCount = 0;
  if (s.pos + 4 > s.src.length) throw new Error('Deflate stream truncated');
  const len = s.src[s.pos]! | (s.src[s.pos + 1]! << 8);
  const nlen = s.src[s.pos + 2]! | (s.src[s.pos + 3]! << 8);
  if ((len ^ 0xffff) !== nlen) {
    throw new Error('Invalid stored block length in deflate stream');
  }
  s.pos += 4;
  if (s.pos + len > s.src.length) throw new Error('Deflate stream truncated');
  s.ensure(len);
  s.out.set(s.src.subarray(s.pos, s.pos + len), s.outLen);
  s.outLen += len;
  s.pos += len;
}

function inflateCodes(s: InflateState, lit: Huffman, dist: Huffman): void {
  for (;;) {
    const sym = s.decodeSymbol(lit);
    if (sym < 256) {
      s.ensure(1);
      s.out[s.outLen++] = sym;
    } else if (sym === 256) {
      return;
    } else {
      const li = sym - 257;
      if (li >= 29) throw new Error('Invalid length code in deflate');
      const length = LENGTH_BASE[li]! + s.bits(LENGTH_EXTRA[li]!);
      const di = s.decodeSymbol(dist);
      if (di >= 30) throw new Error('Invalid distance code in deflate');
      const distance = DIST_BASE[di]! + s.bits(DIST_EXTRA[di]!);
      if (distance > s.outLen) {
        throw new Error('Invalid distance in deflate stream');
      }
      s.ensure(length);
      const out = s.out;
      let from = s.outLen - distance;
      for (let i = 0; i < length; i++) out[s.outLen++] = out[from++]!;
    }
  }
}

function inflateDynamic(s: InflateState): void {
  const hlit = s.bits(5) + 257;
  const hdist = s.bits(5) + 1;
  const hclen = s.bits(4) + 4;
  const clens = new Uint8Array(19);
  for (let i = 0; i < hclen; i++) clens[CLEN_ORDER[i]!] = s.bits(3);
  const clenTable = buildHuffman(clens, 19);
  const lengths = new Uint8Array(hlit + hdist);
  let i = 0;
  while (i < hlit + hdist) {
    const sym = s.decodeSymbol(clenTable);
    if (sym < 16) {
      lengths[i++] = sym;
    } else {
      let repeat: number;
      let value = 0;
      if (sym === 16) {
        if (i === 0) throw new Error('Invalid code length repeat');
        value = lengths[i - 1]!;
        repeat = 3 + s.bits(2);
      } else if (sym === 17) {
        repeat = 3 + s.bits(3);
      } else {
        repeat = 11 + s.bits(7);
      }
      if (i + repeat > hlit + hdist) {
        throw new Error('Too many code lengths in deflate stream');
      }
      lengths.fill(value, i, i + repeat);
      i += repeat;
    }
  }
  const lit = buildHuffman(lengths.subarray(0, hlit), hlit);
  const dist = buildHuffman(lengths.subarray(hlit), hdist);
  inflateCodes(s, lit, dist);
}

/**
 * Decode a raw DEFLATE stream (RFC 1951, no zlib/gzip header).
 * Bytes after the final block (e.g. the PS3.5 A.5 NULL pad) are ignored.
 *
 * @param src - Compressed bytes
 * @param sizeHint - Expected output size, used to size the first buffer
 */
export function inflateRaw(src: Uint8Array, sizeHint = 0): Uint8Array {
  const s = new InflateState(src, sizeHint || src.length * 4);
  let final = 0;
  while (!final) {
    final = s.bits(1);
    const type = s.bits(2);
    if (type === 0) inflateStored(s);
    else if (type === 1) inflateCodes(s, FIXED_LIT, FIXED_DIST);
    else if (type === 2) inflateDynamic(s);
    else throw new Error('Invalid deflate block type');
  }
  return s.out.slice(0, s.outLen);
}

/**
 * Encode bytes as a raw DEFLATE stream made of stored (uncompressed) blocks
 * (RFC 1951 3.2.4). The output is a valid deflate stream that any inflater
 * accepts; it is used by the writer so it needs no compressor.
 */
export function deflateRawStored(src: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(src.length / 0xffff));
  const out = new Uint8Array(src.length + blocks * 5);
  let o = 0;
  for (let b = 0; b < blocks; b++) {
    const start = b * 0xffff;
    const len = Math.min(0xffff, src.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0; // BFINAL, BTYPE=00
    out[o++] = len & 0xff;
    out[o++] = len >>> 8;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(src.subarray(start, start + len), o);
    o += len;
  }
  return out;
}
