import { evaluateAll } from '../dpf/eval';
import { deserializeKey } from '../dpf/serialize';

export interface CollusionResult {
  alpha: number;
  reconstruction: Uint8Array;
}

export function collude(serializedKey0: Uint8Array, serializedKey1: Uint8Array): CollusionResult {
  const key0 = deserializeKey(serializedKey0);
  const key1 = deserializeKey(serializedKey1);
  if (key0.domainBits !== key1.domainBits || key0.party === key1.party) {
    throw new TypeError('collusion requires opposite-party keys for the same domain');
  }
  const share0 = evaluateAll(key0);
  const share1 = evaluateAll(key1);
  const reconstruction = share0.map((bit, index) => bit ^ share1[index]);
  const lit = Array.from(reconstruction.entries()).filter(([, bit]) => bit === 1);
  if (lit.length !== 1) throw new TypeError('malformed key pair: reconstruction is not a point function');
  return { alpha: lit[0][0], reconstruction };
}

// [extension] point: k-party FSS needs a different key relation, not this two-key join.