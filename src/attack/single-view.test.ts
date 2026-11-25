import { describe, expect, it, vi } from 'vitest';
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

  it('reports each party and the actual population at both domain sizes', () => {
    for (const bits of [8, 12]) {
      for (const key of createQuery(3, bits)) {
        const decoded = deserializeKey(key);
        const leaves = evaluateAll(decoded);
        expect(singleShareView(key)).toEqual({
          party: decoded.party, domainBits: bits,
          lit: leaves.filter(bit => bit === 1).length, total: leaves.length
        });
      }
    }
  });

  it('counts a lone lit leaf even when it is at a different index from the request', () => {
    const draw = vi.spyOn(crypto, 'getRandomValues');
    try {
      for (const seed of [150, 151]) {
        draw.mockImplementationOnce(array => {
          if (!(array instanceof Uint8Array) || array.length !== 16) throw new Error('Expected a root seed');
          array.fill(0);
          new DataView(array.buffer, array.byteOffset, array.byteLength).setUint32(0, seed);
          return array;
        });
      }
      const [key0] = createQuery(11, 4);
      expect(singleShareView(key0).lit).toBe(1);
      const leaves = evaluateAll(deserializeKey(key0));
      expect(leaves.indexOf(1)).toBe(10);
      expect(leaves[11]).toBe(0);
    } finally {
      draw.mockRestore();
    }
  });

  it('rejects a malformed key rather than reporting a view of it', () => {
    expect(() => singleShareView(new Uint8Array(3))).toThrow(/truncated root material/);
  });
});
