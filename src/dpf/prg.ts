import { ctr } from '@noble/ciphers/aes.js';
import type { Bit, ExpandedSeed } from './types';
import { SECURITY_BYTES } from './types';

const ZERO_COUNTER = new Uint8Array(16);
const LEAF_COUNTER = new Uint8Array(16);
LEAF_COUNTER[0] = 0x80;

function assertSeed(seed: Uint8Array): void {
  if (seed.length !== SECURITY_BYTES) {
    throw new RangeError(`seed must be ${SECURITY_BYTES} bytes; received ${seed.length}`);
  }
}

/** AES-128-CTR expands a 128-bit seed to two 128-bit seeds and two control bits. */
export function expandSeed(seed: Uint8Array): ExpandedSeed {
  assertSeed(seed);
  const stream = ctr(seed, ZERO_COUNTER).encrypt(new Uint8Array(34));
  return {
    leftSeed: stream.slice(0, 16),
    leftBit: (stream[16] & 1) as Bit,
    rightSeed: stream.slice(17, 33),
    rightBit: (stream[33] & 1) as Bit
  };
}

/** Domain-separated AES-CTR conversion from a leaf seed to one output bit. */
export function leafBit(seed: Uint8Array): Bit {
  assertSeed(seed);
  return (ctr(seed, LEAF_COUNTER).encrypt(new Uint8Array(1))[0] & 1) as Bit;
}

export function randomSeed(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SECURITY_BYTES));
}

export function xorBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length !== right.length) {
    throw new RangeError('byte arrays must have equal length');
  }
  return left.map((value, index) => value ^ right[index]);
}