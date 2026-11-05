/**
 * A uniform draw below a bound, by rejection.
 *
 * `dpf.test.ts` picks a random α in [0, 2^domainBits) at every supported domain size.
 * It drew that with `crypto.getRandomValues(new Uint16Array(1))[0] % domainSize`, and
 * CodeQL flagged the modulo: js/biased-cryptographic-random, high,
 * `src/dpf/dpf.test.ts:32`, raised 2026-10-28.
 *
 * That expression was in fact unbiased, and only by an arithmetic coincidence the
 * reader has to supply: a 16-bit draw has 2^16 outcomes, every supported domain is a
 * power of two no larger than 2^16, and a modulus that divides the range exactly gives
 * every residue the same number of preimages. Nothing stated that, nothing checked it,
 * and it expires the moment the domain outgrows the draw — raise MAX_DOMAIN_BITS to 17
 * and that line confines α to the lower half of the domain while still looking random,
 * so the test would go on reporting that it covered "every supported domain size".
 *
 * Rejection removes the coincidence from the argument. `rejectionLimit` is the largest
 * multiple of the bound that fits the draw; everything at or above it is discarded and
 * drawn again, so the residues that survive are equally likely for ANY bound, not only
 * for the divisors of 65536. The bound is validated rather than assumed, which is the
 * part that would otherwise fail silently.
 */

/** The number of distinct values one 16-bit draw can take. */
export const DRAW_RANGE = 0x1_0000;

/** Fills `out` with cryptographically random 16-bit values. */
export type Uint16Source = (out: Uint16Array<ArrayBuffer>) => void;

export const cryptoUint16Source: Uint16Source = (out) => {
  crypto.getRandomValues(out);
};

/**
 * The largest multiple of `bound` that fits in one 16-bit draw. Draws at or above it
 * are the tail that would make the low residues likelier, so they are rejected.
 */
export function rejectionLimit(bound: number): number {
  return DRAW_RANGE - (DRAW_RANGE % bound);
}

/** A uniform integer in [0, bound), with no modulo bias for any bound in range. */
export function randomBelow(bound: number, source: Uint16Source = cryptoUint16Source): number {
  if (!Number.isInteger(bound) || bound < 1 || bound > DRAW_RANGE) {
    throw new RangeError(`bound must be an integer in [1, ${DRAW_RANGE}]`);
  }
  const limit = rejectionLimit(bound);
  const draw = new Uint16Array(1) as Uint16Array<ArrayBuffer>;
  for (;;) {
    source(draw);
    if (draw[0] < limit) return draw[0] % bound;
  }
}
