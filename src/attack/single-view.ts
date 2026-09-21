import { evaluateAll } from '../dpf/eval';
import { deserializeKey } from '../dpf/serialize';
import type { Bit } from '../dpf/types';

export interface SingleShareView {
  party: Bit;
  domainBits: number;
  lit: number;
  total: number;
  namesAPoint: boolean;
}

/**
 * Everything one server can compute from its own key alone. A DPF share expands
 * to a pseudorandom bit string; the pair is a point function only after the XOR.
 * `namesAPoint` is precisely the property non-collusion is supposed to keep
 * false, so the page renders it rather than asserting it in prose.
 */
export function singleShareView(serializedKey: Uint8Array): SingleShareView {
  const key = deserializeKey(serializedKey);
  const share = evaluateAll(key);
  let lit = 0;
  for (const bit of share) lit += bit;
  return {
    party: key.party,
    domainBits: key.domainBits,
    lit,
    total: share.length,
    namesAPoint: lit === 1
  };
}

// [extension] point: a distinguisher stronger than "is it a point vector" would
// need many shares, which is a different experiment than this one-key view.
