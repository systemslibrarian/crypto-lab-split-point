import type { Bit, DpfKey } from './types';
import { MAX_DOMAIN_BITS, MIN_DOMAIN_BITS, SECURITY_BYTES } from './types';

const ROOT_MATERIAL_BYTES = 1 + SECURITY_BYTES;
const CORRECTION_WORD_BYTES = SECURITY_BYTES + 1;
const FINAL_CORRECTION_BYTES = 1;

export interface SerializedKeyParts {
  rootMaterial: number;
  correctionWords: number;
  finalCorrection: number;
  total: number;
}

export function serializedKeyParts(domainBits: number): SerializedKeyParts {
  if (!Number.isInteger(domainBits) || domainBits < MIN_DOMAIN_BITS || domainBits > MAX_DOMAIN_BITS) {
    throw new RangeError(`domainBits must be an integer from ${MIN_DOMAIN_BITS} to ${MAX_DOMAIN_BITS}`);
  }
  const correctionWords = domainBits * CORRECTION_WORD_BYTES;
  return {
    rootMaterial: ROOT_MATERIAL_BYTES,
    correctionWords,
    finalCorrection: FINAL_CORRECTION_BYTES,
    total: ROOT_MATERIAL_BYTES + correctionWords + FINAL_CORRECTION_BYTES
  };
}

export function serializeKey(key: DpfKey): Uint8Array {
  const parts = serializedKeyParts(key.domainBits);
  if (key.version !== 1 || key.rootSeed.length !== SECURITY_BYTES) {
    throw new TypeError('malformed key: unsupported version or root seed length');
  }
  if (key.correctionWords.length !== key.domainBits) {
    throw new TypeError('malformed key: correction-word count does not match domain');
  }
  const bytes = new Uint8Array(parts.total);
  bytes[0] = (key.party << 7) | key.domainBits;
  bytes.set(key.rootSeed, 1);
  let offset = ROOT_MATERIAL_BYTES;
  for (const word of key.correctionWords) {
    if (word.seed.length !== SECURITY_BYTES) {
      throw new TypeError('malformed key: correction seed must be 16 bytes');
    }
    bytes.set(word.seed, offset);
    bytes[offset + SECURITY_BYTES] = word.leftBit | (word.rightBit << 1);
    offset += CORRECTION_WORD_BYTES;
  }
  bytes[offset] = key.finalCorrection;
  return bytes;
}

export function deserializeKey(bytes: Uint8Array): DpfKey {
  if (bytes.length < ROOT_MATERIAL_BYTES + FINAL_CORRECTION_BYTES) {
    throw new TypeError('malformed key: truncated root material');
  }
  if ((bytes[0] & 0x60) !== 0) throw new TypeError('malformed key: reserved header bits are set');
  const domainBits = bytes[0] & 0x1f;
  const party = (bytes[0] >>> 7) as Bit;
  const expected = serializedKeyParts(domainBits).total;
  if (bytes.length !== expected) {
    throw new TypeError(`malformed key: expected ${expected} bytes; received ${bytes.length}`);
  }
  const correctionWords = [];
  let offset = ROOT_MATERIAL_BYTES;
  for (let level = 0; level < domainBits; level += 1) {
    const control = bytes[offset + SECURITY_BYTES];
    if (control > 3) throw new TypeError(`malformed key: correction control byte at level ${level + 1}`);
    correctionWords.push({
      seed: bytes.slice(offset, offset + SECURITY_BYTES),
      leftBit: (control & 1) as Bit,
      rightBit: ((control >>> 1) & 1) as Bit
    });
    offset += CORRECTION_WORD_BYTES;
  }
  const finalCorrection = bytes[offset];
  if (finalCorrection > 1) throw new TypeError('malformed key: final correction is not a bit');
  return {
    version: 1,
    domainBits,
    party,
    rootSeed: bytes.slice(1, ROOT_MATERIAL_BYTES),
    correctionWords,
    finalCorrection: finalCorrection as Bit
  };
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}