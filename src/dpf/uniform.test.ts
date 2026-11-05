import { describe, expect, it } from 'vitest';
import { DRAW_RANGE, randomBelow, rejectionLimit, type Uint16Source } from './uniform';

/**
 * A source that hands out exactly the values it was given, counts how many it was asked
 * for, and THROWS when it runs dry. Repeating its last value would make a bound mutation
 * spin forever instead of failing, which is how a boundary test stops being one.
 */
function scripted(values: readonly number[]): { source: Uint16Source; draws: () => number } {
  let index = 0;
  return {
    source: (out) => {
      if (index >= values.length) throw new Error(`the scripted source ran dry after ${index} draws`);
      out[0] = values[index];
      if (out[0] !== values[index]) throw new Error(`${values[index]} does not fit a 16-bit draw`);
      index += 1;
    },
    draws: () => index
  };
}

/** The limit, derived here by a different route than the code's: floor division, not remainder. */
function expectedLimit(bound: number): number {
  return Math.floor(DRAW_RANGE / bound) * bound;
}

describe('uniform draws below a bound', () => {
  it('rejects exactly the tail no multiple of the bound can reach', () => {
    for (const bound of [1, 2, 3, 7, 10, 255, 256, 1000, 40_001, 65_535, DRAW_RANGE]) {
      const limit = rejectionLimit(bound);
      expect(limit).toBe(expectedLimit(bound));
      expect(limit % bound).toBe(0);
      expect(DRAW_RANGE - limit).toBeLessThan(bound);
    }
  });

  it('spends a draw on the first value at the limit, and returns the next one below it', () => {
    const bound = 1000;
    const limit = expectedLimit(bound);
    expect(limit).toBe(65_000);
    const { source, draws } = scripted([limit, limit + 234, DRAW_RANGE - 1, 4321]);
    expect(randomBelow(bound, source)).toBe(321);
    expect(draws()).toBe(4);
  });

  it('accepts the value immediately below the limit, on the first draw', () => {
    const bound = 1000;
    const { source, draws } = scripted([expectedLimit(bound) - 1]);
    expect(randomBelow(bound, source)).toBe(999);
    expect(draws()).toBe(1);
  });

  it('draws every residue exactly equally often over the whole 16-bit range', () => {
    const bound = 1000;
    const counts = new Array<number>(bound).fill(0);
    for (let value = 0; value < DRAW_RANGE; value += 1) {
      const { source } = scripted([value, 0]);
      counts[randomBelow(bound, source)] += 1;
    }
    // Exhaustive rather than statistical: every accepted draw is enumerated, so this is
    // exact uniformity, not a test that failed to reject it.
    const expectedCount = expectedLimit(bound) / bound;
    expect(expectedCount).toBe(65);
    // The rejected tail is re-drawn as the scripted 0, so those land on residue 0.
    counts[0] -= DRAW_RANGE - expectedLimit(bound);
    expect(counts.filter((count) => count !== expectedCount)).toEqual([]);
  });

  it('refuses a bound it cannot draw uniformly', () => {
    for (const bound of [0, -1, 1.5, Number.NaN, DRAW_RANGE + 1]) {
      expect(() => randomBelow(bound, scripted([0]).source)).toThrow(/bound must be an integer/);
    }
  });
});
