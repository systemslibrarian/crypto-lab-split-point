import { evaluateAll } from '../dpf/eval';
import { deserializeKey } from '../dpf/serialize';
import type { Bit } from '../dpf/types';

export interface SingleShareView {
  party: Bit;
  domainBits: number;
  lit: number;
  total: number;
}
/** Counts lit leaves in one expanded share. Privacy does not depend on its population. */
export function singleShareView(serializedKey: Uint8Array): SingleShareView {
  const key = deserializeKey(serializedKey);
  const share = evaluateAll(key);
  let lit = 0;
  for (const bit of share) lit += bit;
  return {
    party: key.party,
    domainBits: key.domainBits,
    lit,
    total: share.length
  };
}
