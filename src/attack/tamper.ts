export function tamperAnswer(answer: Uint8Array): Uint8Array {
  if (answer.length === 0) throw new RangeError('cannot tamper with an empty server answer');
  const tampered = answer.slice();
  tampered[0] ^= 1;
  return tampered;
}