import { generateDpf } from '../dpf/gen';
import { serializeKey } from '../dpf/serialize';
import { serverAnswer } from './server';

export interface PirTranscript {
  keys: readonly [Uint8Array, Uint8Array];
  answers: readonly [Uint8Array, Uint8Array];
  record: Uint8Array;
}

export function createQuery(alpha: number, domainBits: number): readonly [Uint8Array, Uint8Array] {
  const [key0, key1] = generateDpf(alpha, domainBits);
  return [serializeKey(key0), serializeKey(key1)];
}

export function reconstruct(answer0: Uint8Array, answer1: Uint8Array): Uint8Array {
  if (answer0.length === 0 || answer0.length !== answer1.length) {
    throw new RangeError(
      `server answers must have one matching non-zero length; received ${answer0.length} and ${answer1.length}`
    );
  }
  return answer0.map((byte, index) => byte ^ answer1[index]);
}

export function fetchRecord(alpha: number, shelf: ReadonlyArray<Uint8Array>): PirTranscript {
  const domainBits = Math.log2(shelf.length);
  if (!Number.isInteger(domainBits)) throw new RangeError('shelf length must be a power of two');
  const keys = createQuery(alpha, domainBits);
  const answers = [serverAnswer(keys[0], shelf), serverAnswer(keys[1], shelf)] as const;
  return { keys, answers, record: reconstruct(answers[0], answers[1]) };
}

// [extension] point: verifiable PIR can authenticate answers before reconstruct().