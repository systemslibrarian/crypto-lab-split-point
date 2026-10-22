import type { Bit, DpfKey } from './types';
import { MAX_DOMAIN_BITS, MIN_DOMAIN_BITS, SECURITY_BYTES } from './types';

function isBit(value: unknown): value is Bit {
  return value === 0 || value === 1;
}

function isSeed(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.length === SECURITY_BYTES;
}

/**
 * TypeScript's DpfKey interface disappears at runtime. Public DPF operations
 * therefore validate every field before a malformed JavaScript object can be
 * coerced into an encoding or expanded as a tree.
 */
export function assertValidDpfKey(key: DpfKey): void {
  const candidate = key as Partial<DpfKey> | null;
  if (candidate === null || typeof candidate !== 'object') {
    throw new TypeError('malformed key: expected a key object');
  }
  if (candidate.version !== 1) {
    throw new TypeError('malformed key: unsupported version');
  }
  if (
    !Number.isInteger(candidate.domainBits) ||
    (candidate.domainBits as number) < MIN_DOMAIN_BITS ||
    (candidate.domainBits as number) > MAX_DOMAIN_BITS
  ) {
    throw new TypeError(
      `malformed key: domainBits must be an integer from ${MIN_DOMAIN_BITS} to ${MAX_DOMAIN_BITS}`
    );
  }
  if (!isBit(candidate.party)) {
    throw new TypeError('malformed key: party is not a bit');
  }
  if (!isSeed(candidate.rootSeed)) {
    throw new TypeError(`malformed key: root seed must be ${SECURITY_BYTES} bytes`);
  }
  if (
    !Array.isArray(candidate.correctionWords) ||
    candidate.correctionWords.length !== candidate.domainBits
  ) {
    throw new TypeError('malformed key: correction-word count does not match domain');
  }
  for (const [level, word] of candidate.correctionWords.entries()) {
    if (word === null || typeof word !== 'object') {
      throw new TypeError(`malformed key: correction word at level ${level + 1} is not an object`);
    }
    if (!isSeed(word.seed)) {
      throw new TypeError(
        `malformed key: correction seed at level ${level + 1} must be ${SECURITY_BYTES} bytes`
      );
    }
    if (!isBit(word.leftBit) || !isBit(word.rightBit)) {
      throw new TypeError(`malformed key: correction control at level ${level + 1} is not a bit`);
    }
  }
  if (!isBit(candidate.finalCorrection)) {
    throw new TypeError('malformed key: final correction is not a bit');
  }
}
