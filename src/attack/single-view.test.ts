import { describe, expect, it } from 'vitest';
import { evaluateAll } from '../dpf/eval';
import { createQuery } from '../pir/client';
import { deserializeKey } from '../dpf/serialize';
import { singleShareView } from './single-view';

describe('what one server sees from its own key', () => {
  it('reports the real lit count of a single expanded share', () => {
    const [key0] = createQuery(9, 8);
    const view = singleShareView(key0);
    const share = evaluateAll(deserializeKey(key0));
    expect(view.total).toBe(256);
    expect(view.lit).toBe(share.reduce((count, bit) => count + bit, 0));
    expect(view.party).toBe(0);
    expect(view.domainBits).toBe(8);
  });

  it('names no point from one share, at every domain it is asked about', () => {
    for (const domainBits of [8, 12]) {
      const [key0, key1] = createQuery(3, domainBits);
      expect(singleShareView(key0).namesAPoint).toBe(false);
      expect(singleShareView(key1).namesAPoint).toBe(false);
    }
  });

  it('ties namesAPoint to the measured lit count, not to the party or domain', () => {
    const [key0, key1] = createQuery(7, 8);
    for (const key of [key0, key1]) {
      const view = singleShareView(key);
      expect(view.namesAPoint).toBe(view.lit === 1);
    }
  });

  it('rejects a malformed key rather than reporting a view of it', () => {
    expect(() => singleShareView(new Uint8Array(3))).toThrow(/truncated root material/);
  });
});
