export type Bit = 0 | 1;

export interface CorrectionWord {
  seed: Uint8Array;
  leftBit: Bit;
  rightBit: Bit;
}

export interface DpfKey {
  version: 1;
  domainBits: number;
  party: Bit;
  rootSeed: Uint8Array;
  correctionWords: CorrectionWord[];
  finalCorrection: Bit;
}

export interface ExpandedSeed {
  leftSeed: Uint8Array;
  leftBit: Bit;
  rightSeed: Uint8Array;
  rightBit: Bit;
}

export const SECURITY_BYTES = 16;
export const MIN_DOMAIN_BITS = 4;
export const MAX_DOMAIN_BITS = 16;