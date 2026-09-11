import { expandSeed, leafBit, randomSeed, xorBytes } from './prg';
import type { Bit, CorrectionWord, DpfKey } from './types';
import { MAX_DOMAIN_BITS, MIN_DOMAIN_BITS } from './types';

interface NodeState {
  seed: Uint8Array;
  control: Bit;
}

function validatePoint(alpha: number, domainBits: number): void {
  if (!Number.isInteger(domainBits) || domainBits < MIN_DOMAIN_BITS || domainBits > MAX_DOMAIN_BITS) {
    throw new RangeError(`domainBits must be an integer from ${MIN_DOMAIN_BITS} to ${MAX_DOMAIN_BITS}`);
  }
  const domainSize = 2 ** domainBits;
  if (!Number.isInteger(alpha) || alpha < 0 || alpha >= domainSize) {
    throw new RangeError(`alpha must be an integer in [0, ${domainSize - 1}]`);
  }
}

function correctedChild(
  expanded: ReturnType<typeof expandSeed>,
  direction: Bit,
  parentControl: Bit,
  correction: CorrectionWord
): NodeState {
  const childSeed = direction === 0 ? expanded.leftSeed : expanded.rightSeed;
  const childControl = direction === 0 ? expanded.leftBit : expanded.rightBit;
  if (parentControl === 0) return { seed: childSeed, control: childControl };
  return {
    seed: xorBytes(childSeed, correction.seed),
    control: (childControl ^ (direction === 0 ? correction.leftBit : correction.rightBit)) as Bit
  };
}

export function generateDpf(alpha: number, domainBits: number): readonly [DpfKey, DpfKey] {
  validatePoint(alpha, domainBits);
  const roots: readonly [NodeState, NodeState] = [
    { seed: randomSeed(), control: 0 },
    { seed: randomSeed(), control: 1 }
  ];
  let states: [NodeState, NodeState] = [roots[0], roots[1]];
  const correctionWords: CorrectionWord[] = [];

  for (let level = 0; level < domainBits; level += 1) {
    const direction = ((alpha >>> (domainBits - level - 1)) & 1) as Bit;
    const loseDirection = (direction ^ 1) as Bit;
    const expanded = [expandSeed(states[0].seed), expandSeed(states[1].seed)] as const;
    const correction: CorrectionWord = {
      seed: xorBytes(
        loseDirection === 0 ? expanded[0].leftSeed : expanded[0].rightSeed,
        loseDirection === 0 ? expanded[1].leftSeed : expanded[1].rightSeed
      ),
      leftBit: (expanded[0].leftBit ^ expanded[1].leftBit ^ direction ^ 1) as Bit,
      rightBit: (expanded[0].rightBit ^ expanded[1].rightBit ^ direction) as Bit
    };
    correctionWords.push(correction);
    states = [
      correctedChild(expanded[0], direction, states[0].control, correction),
      correctedChild(expanded[1], direction, states[1].control, correction)
    ];
  }

  const finalCorrection = (1 ^ leafBit(states[0].seed) ^ leafBit(states[1].seed)) as Bit;
  const makeKey = (party: Bit): DpfKey => ({
    version: 1,
    domainBits,
    party,
    rootSeed: roots[party].seed,
    correctionWords: correctionWords.map((word) => ({
      seed: word.seed.slice(),
      leftBit: word.leftBit,
      rightBit: word.rightBit
    })),
    finalCorrection
  });

  return [makeKey(0), makeKey(1)];
}