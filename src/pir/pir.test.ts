import { describe, expect, it } from 'vitest';
import { collude } from '../attack/collude';
import { tamperAnswer } from '../attack/tamper';
import { createQuery, fetchRecord, reconstruct } from './client';
import { createShelf, makeRecord, recordIndex } from './shelf';
import { serverAnswer, serverAnswerProgressive } from './server';

describe('two-server XOR PIR', () => {
  it('retrieves shelf[alpha] through two independently folded answers', () => {
    const shelf = createShelf(64);
    const transcript = fetchRecord(37, shelf);
    expect(transcript.record).toEqual(shelf[37]);
    expect(transcript.answers[0]).not.toEqual(shelf[37]);
    expect(transcript.answers[1]).not.toEqual(shelf[37]);
  });

  it('gives each server exactly one key argument and the public shelf', () => {
    expect(serverAnswer.length).toBe(2);
    const shelf = createShelf(16);
    const [key0, key1] = createQuery(9, 4);
    expect(reconstruct(serverAnswer(key0, shelf), serverAnswer(key1, shelf))).toEqual(shelf[9]);
  });

  it('reports progress from the real fold without changing its answer', async () => {
    const shelf = createShelf(16);
    const [key] = createQuery(5, 4);
    const progress: number[] = [];
    const fold = await serverAnswerProgressive(key, shelf, (completed) => progress.push(completed));
    expect(fold.answer).toEqual(serverAnswer(key, shelf));
    expect(progress.at(-1)).toBe(16);
  });

  it('counts the records its own share selected, which is neither none nor one', async () => {
    const shelf = createShelf(256);
    const [key0, key1] = createQuery(5, 8);
    const fold0 = await serverAnswerProgressive(key0, shelf, () => {});
    const fold1 = await serverAnswerProgressive(key1, shelf, () => {});
    expect(fold0.scannedRecords).toBe(256);
    expect(fold1.scannedRecords).toBe(256);
    // The two folds differ by exactly the one record the point function selects.
    expect(Math.abs(fold0.foldedRecords - fold1.foldedRecords)).toBe(1);
    expect(fold0.foldedRecords).toBeGreaterThan(1);
    expect(fold0.foldedRecords).toBeLessThan(256);
  });

  it('folds records wider than one AES block without truncation', () => {
    const shelf = createShelf(16, 17);
    expect(fetchRecord(12, shelf).record).toEqual(shelf[12]);
  });

  it('fails closed on a wrong shelf shape or wrong-length answers', () => {
    const [key] = createQuery(3, 4);
    expect(() => serverAnswer(key, createShelf(8))).toThrow(/16 records/);
    const mixedWidthShelf = createShelf(16);
    mixedWidthShelf[15] = new Uint8Array(7);
    expect(() => serverAnswer(key, mixedWidthShelf)).toThrow(/fixed width/);
    expect(() => reconstruct(new Uint8Array(16), new Uint8Array(15))).toThrow(/matching non-zero length/);
    expect(() => reconstruct(new Uint8Array(), new Uint8Array())).toThrow(/matching non-zero length/);
  });

  it('collusion reconstructs the hidden index', () => {
    const keys = createQuery(13, 4);
    const result = collude(keys[0], keys[1]);
    expect(result.alpha).toBe(13);
    expect(Array.from(result.reconstruction).filter((bit) => bit === 1)).toHaveLength(1);
  });

  it('rejects collusion inputs that are not an opposite-party pair', () => {
    const [key] = createQuery(4, 4);
    expect(() => collude(key, key)).toThrow(/opposite-party/);
  });

  it('demonstrates the unauthenticated-answer negative claim', () => {
    const shelf = createShelf(16);
    const keys = createQuery(6, 4);
    const answer0 = serverAnswer(keys[0], shelf);
    const answer1 = serverAnswer(keys[1], shelf);
    const corrupted = reconstruct(answer0, tamperAnswer(answer1));
    expect(corrupted).not.toEqual(shelf[6]);
    expect(corrupted.length).toBe(shelf[6].length);
  });

  it('builds deterministic fixed-width records with their index embedded', () => {
    expect(makeRecord(42)).toEqual(makeRecord(42));
    expect(recordIndex(makeRecord(42))).toBe(42);
    expect(() => makeRecord(-1)).toThrow(/unsigned/);
    expect(() => makeRecord(1, 3)).toThrow(/at least 4/);
    expect(() => createShelf(3)).toThrow(/power of two/);
    expect(() => recordIndex(new Uint8Array(3))).toThrow(/4-byte index/);
  });
});