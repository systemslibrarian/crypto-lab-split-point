/**
 * Ratcheting baseline for known non-text contrast findings.
 * Empty is the intended terminal state: regressions must be fixed, not exempted.
 */
export const NONTEXT_BASELINE: Record<string, { ratio: number; required: number }> = {};