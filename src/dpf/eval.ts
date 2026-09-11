import { expandSeed, leafBit, xorBytes } from './prg';
import type { Bit, DpfKey } from './types';

interface NodeState {
  seed: Uint8Array;
  control: Bit;
}

export interface TreeNodeState {
  seed: Uint8Array;
  control: Bit;
}

function validateEvaluation(key: DpfKey, point: number): void {
  const domainSize = 2 ** key.domainBits;
  if (!Number.isInteger(point) || point < 0 || point >= domainSize) {
    throw new RangeError(`point must be an integer in [0, ${domainSize - 1}]`);
  }
  if (key.correctionWords.length !== key.domainBits) {
    throw new TypeError('malformed key: correction-word count does not match domain');
  }
}

function children(state: NodeState, key: DpfKey, level: number): readonly [NodeState, NodeState] {
  const expanded = expandSeed(state.seed);
  const correction = key.correctionWords[level];
  const apply = (seed: Uint8Array, bit: Bit, correctionBit: Bit): NodeState =>
    state.control === 0
      ? { seed, control: bit }
      : { seed: xorBytes(seed, correction.seed), control: (bit ^ correctionBit) as Bit };
  return [
    apply(expanded.leftSeed, expanded.leftBit, correction.leftBit),
    apply(expanded.rightSeed, expanded.rightBit, correction.rightBit)
  ];
}

function output(state: NodeState, key: DpfKey): Bit {
  return (leafBit(state.seed) ^ (state.control & key.finalCorrection)) as Bit;
}

export function evaluate(key: DpfKey, point: number): Bit {
  validateEvaluation(key, point);
  let state: NodeState = { seed: key.rootSeed, control: key.party };
  for (let level = 0; level < key.domainBits; level += 1) {
    const direction = (point >>> (key.domainBits - level - 1)) & 1;
    state = children(state, key, level)[direction];
  }
  return output(state, key);
}

export function evaluateAll(key: DpfKey): Uint8Array {
  validateEvaluation(key, 0);
  let frontier: NodeState[] = [{ seed: key.rootSeed, control: key.party }];
  for (let level = 0; level < key.domainBits; level += 1) {
    const next: NodeState[] = new Array(frontier.length * 2);
    for (let index = 0; index < frontier.length; index += 1) {
      const [left, right] = children(frontier[index], key, level);
      next[index * 2] = left;
      next[index * 2 + 1] = right;
    }
    frontier = next;
  }
  return Uint8Array.from(frontier, (state) => output(state, key));
}

export function evaluateLevel(key: DpfKey, level: number): TreeNodeState[] {
  if (!Number.isInteger(level) || level < 0 || level > key.domainBits) {
    throw new RangeError(`level must be an integer in [0, ${key.domainBits}]`);
  }
  validateEvaluation(key, 0);
  let frontier: NodeState[] = [{ seed: key.rootSeed, control: key.party }];
  for (let current = 0; current < level; current += 1) {
    frontier = frontier.flatMap((state) => children(state, key, current));
  }
  return frontier.map((state) => ({ seed: state.seed.slice(), control: state.control }));
}