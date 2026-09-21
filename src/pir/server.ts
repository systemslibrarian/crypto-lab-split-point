import { evaluateAll } from '../dpf/eval';
import { deserializeKey } from '../dpf/serialize';

/** A server receives one serialized DPF key and the public shelf, never alpha. */
export function serverAnswer(serializedKey: Uint8Array, shelf: ReadonlyArray<Uint8Array>): Uint8Array {
  const key = deserializeKey(serializedKey);
  const expectedRecords = 2 ** key.domainBits;
  if (shelf.length !== expectedRecords) {
    throw new RangeError(`shelf must contain ${expectedRecords} records; received ${shelf.length}`);
  }
  const width = shelf[0]?.length ?? 0;
  if (width === 0 || shelf.some((record) => record.length !== width)) {
    throw new RangeError('shelf records must have one non-zero fixed width');
  }

  const share = evaluateAll(key);
  const answer = new Uint8Array(width);
  for (let index = 0; index < shelf.length; index += 1) {
    if (share[index] === 0) continue;
    for (let offset = 0; offset < width; offset += 1) answer[offset] ^= shelf[index][offset];
  }
  return answer;
}

export interface ProgressiveAnswer {
  answer: Uint8Array;
  /** How many shelf records this server's own share selected into the fold. */
  foldedRecords: number;
  /** How many records the server scanned, which is always the whole shelf. */
  scannedRecords: number;
}

export async function serverAnswerProgressive(
  serializedKey: Uint8Array,
  shelf: ReadonlyArray<Uint8Array>,
  onProgress: (completed: number, total: number) => void
): Promise<ProgressiveAnswer> {
  const key = deserializeKey(serializedKey);
  const expectedRecords = 2 ** key.domainBits;
  if (shelf.length !== expectedRecords) {
    throw new RangeError(`shelf must contain ${expectedRecords} records; received ${shelf.length}`);
  }
  const width = shelf[0]?.length ?? 0;
  if (width === 0 || shelf.some((record) => record.length !== width)) {
    throw new RangeError('shelf records must have one non-zero fixed width');
  }

  const share = evaluateAll(key);
  const answer = new Uint8Array(width);
  let foldedRecords = 0;
  const chunkSize = Math.max(16, Math.ceil(shelf.length / 32));
  for (let start = 0; start < shelf.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, shelf.length);
    for (let index = start; index < end; index += 1) {
      if (share[index] === 0) continue;
      foldedRecords += 1;
      for (let offset = 0; offset < width; offset += 1) answer[offset] ^= shelf[index][offset];
    }
    onProgress(end, shelf.length);
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
  }
  return { answer, foldedRecords, scannedRecords: shelf.length };
}

// [extension] point: a batched server can share this fold while changing the query shape.