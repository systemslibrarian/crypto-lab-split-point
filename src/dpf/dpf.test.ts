import { describe, expect, it } from 'vitest';
import { evaluate, evaluateAll, evaluateLevel } from './eval';
import { generateDpf } from './gen';
import { expandSeed, leafBit, xorBytes } from './prg';
import { deserializeKey, serializeKey, serializedKeyParts, toHex } from './serialize';

describe('BGI distributed point function', () => {
  it('reconstructs one point and zero everywhere else', () => {
    const alpha = 11;
    const [key0, key1] = generateDpf(alpha, 4);
    const share0 = evaluateAll(key0);
    const share1 = evaluateAll(key1);
    const reconstruction = share0.map((bit, index) => bit ^ share1[index]);

    expect(Array.from(reconstruction)).toEqual(
      Array.from({ length: 16 }, (_, index) => (index === alpha ? 1 : 0))
    );
  });

  it('round-trips both serialized keys at the measured size', () => {
    const keys = generateDpf(7, 6);
    for (const key of keys) {
      const bytes = serializeKey(key);
      expect(bytes).toHaveLength(serializedKeyParts(6).total);
      expect(deserializeKey(bytes)).toEqual(key);
    }
  });

  it('matches an independently constructed point vector at every supported domain size', () => {
    for (let domainBits = 4; domainBits <= 16; domainBits += 1) {
      const domainSize = 2 ** domainBits;
      const alpha = crypto.getRandomValues(new Uint16Array(1))[0] % domainSize;
      const [key0, key1] = generateDpf(alpha, domainBits);
      const share0 = evaluateAll(key0);
      const share1 = evaluateAll(key1);
      for (let index = 0; index < domainSize; index += 1) {
        const naivePoint = index === alpha ? 1 : 0;
        expect(share0[index] ^ share1[index]).toBe(naivePoint);
      }
    }
  }, 30_000);

  it('agrees between single-point and full-domain evaluation', () => {
    const keys = generateDpf(29, 6);
    for (const key of keys) {
      const all = evaluateAll(key);
      for (const point of [0, 1, 29, 63]) expect(evaluate(key, point)).toBe(all[point]);
    }
  });

  it('exposes real seed and control state at every tree level', () => {
    const [key] = generateDpf(3, 4);
    for (let level = 0; level <= 4; level += 1) {
      const nodes = evaluateLevel(key, level);
      expect(nodes).toHaveLength(2 ** level);
      expect(nodes.every((node) => node.seed.length === 16)).toBe(true);
    }
  });

  it('allows the all-zero AES seed and produces the required PRG shape', () => {
    const expanded = expandSeed(new Uint8Array(16));
    expect(expanded.leftSeed).toHaveLength(16);
    expect(expanded.rightSeed).toHaveLength(16);
    expect([0, 1]).toContain(expanded.leftBit);
    expect([0, 1]).toContain(expanded.rightBit);
    expect([0, 1]).toContain(leafBit(new Uint8Array(16)));
  });

  it('rejects degenerate domains and alpha outside the domain', () => {
    expect(() => generateDpf(0, 0)).toThrow(/domainBits/);
    expect(() => generateDpf(-1, 4)).toThrow(/alpha/);
    expect(() => generateDpf(16, 4)).toThrow(/alpha/);
    expect(() => evaluate(generateDpf(1, 4)[0], 16)).toThrow(/point/);
    expect(() => evaluateLevel(generateDpf(1, 4)[0], 5)).toThrow(/level/);
  });

  it('rejects malformed key encodings with named causes', () => {
    const bytes = serializeKey(generateDpf(2, 4)[0]);
    expect(() => deserializeKey(bytes.slice(0, 5))).toThrow(/truncated root/);
    const reserved = bytes.slice();
    reserved[0] |= 0x20;
    expect(() => deserializeKey(reserved)).toThrow(/reserved header/);
    const control = bytes.slice();
    control[17 + 16] = 4;
    expect(() => deserializeKey(control)).toThrow(/control byte at level 1/);
    const final = bytes.slice();
    final[final.length - 1] = 2;
    expect(() => deserializeKey(final)).toThrow(/final correction/);
  });

  it('reports serialization parts that add to the byte dump', () => {
    const bytes = serializeKey(generateDpf(9, 8)[0]);
    const parts = serializedKeyParts(8);
    expect(parts.rootMaterial + parts.correctionWords + parts.finalCorrection).toBe(parts.total);
    expect(toHex(bytes)).toHaveLength(parts.total * 2);
  });

  it('rejects malformed helper inputs', () => {
    expect(() => expandSeed(new Uint8Array(15))).toThrow(/seed must be 16 bytes/);
    expect(() => leafBit(new Uint8Array(17))).toThrow(/seed must be 16 bytes/);
    expect(() => xorBytes(new Uint8Array(1), new Uint8Array(2))).toThrow(/equal length/);
    expect(() => serializedKeyParts(17)).toThrow(/domainBits/);
  });
});