import { resetLedger } from './verdict-ledger';

/**
 * Clear the executed-assertion ledger once per run. A sink left over from an
 * earlier run would make the coverage proof answer a question about a tree that
 * is no longer on disk — the same shape as a mutation reported as a survivor
 * because the patch never applied.
 */
export default function globalSetup(): void {
  resetLedger();
}
