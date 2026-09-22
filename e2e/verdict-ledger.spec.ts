import { expect, test } from '@playwright/test';
import { readLedger, recordsFor, type Family, type LedgerEntry } from './verdict-ledger';

/**
 * "Every recorded mutation is killed through the shared helper", asserted over
 * the run that just happened.
 *
 * This replaces a regex over spec source, and it replaces it because that regex
 * was satisfiable three ways with the mutation still shipping green: the call
 * commented out, the call kept but handed the page's own values, and — this
 * lab's own instance — the killing assertion rewritten while an unrelated call
 * for the same marker, in a different test, stayed in the file. The rule was
 * FILE-granular, so the unrelated line answered for the rewritten one.
 *
 * The ledger is written by expectVerdict/expectClaim as they execute, so the
 * denominator here is what RAN. This project `dependencies:` on the specs that
 * write it; running it without them is the one way it could report clean while
 * seeing nothing, and the emptiness check below is that guard.
 */

const FAMILIES: ReadonlyArray<[Family, string, string]> = [
  ['verdict', 'markers', 'expectVerdict'],
  ['claim', 'claims', 'expectClaim']
];

function describeEntry(entry: LedgerEntry): string {
  return `${entry.spec} › ${entry.test}${entry.status === undefined ? '' : ` (status "${entry.status}")`}`;
}

test('every recorded mutation was killed through the helper, in the test its record names', () => {
  const ledger = readLedger();
  expect(
    ledger.length,
    'the executed-assertion ledger is empty: expectVerdict/expectClaim recorded nothing this run, so ' +
      'nothing below is evidence about anything. Run this project through its `claims` dependency.'
  ).toBeGreaterThan(0);

  for (const [family, key, helper] of FAMILIES) {
    for (const [marker, record] of Object.entries(recordsFor(family))) {
      expect(record.mutation.length, `${marker} records a mutation`).toBeGreaterThan(20);
      expect(record.expectedFlip.length, `${marker} records the flip it expects`).toBeGreaterThan(20);

      const declared = record.assertedBy;
      expect(declared, `${key}.${marker} declares the assertion that kills it`).toBeTruthy();
      expect(declared.spec, `${marker}: assertedBy.spec names a spec file`).toMatch(/^e2e\/.+\.spec\.ts$/);
      expect(declared.test.length, `${marker}: assertedBy.test names a test`).toBeGreaterThan(10);
      expect(declared.says.length, `${marker}: assertedBy.says declares words the assertion must require`).toBeGreaterThan(0);

      const forMarker = ledger.filter((entry) => entry.family === family && entry.marker === marker);
      const exact = forMarker.filter((entry) => entry.spec === declared.spec && entry.test === declared.test);
      expect(
        exact.length,
        `${marker}: e2e/verdict-mutations.json says its mutation is killed by ${helper} in ` +
          `${declared.spec} › "${declared.test}", and that call did not execute this run. ` +
          `${helper} ran for ${marker} in: ${
            forMarker.length === 0 ? 'no test at all' : forMarker.map(describeEntry).join(' | ')
          }. A call in another test, in a comment, or deleted outright all look the same from here — ` +
          'which is the point.'
      ).toBeGreaterThan(0);

      if (declared.status !== undefined) {
        expect(
          exact.map((entry) => entry.status),
          `${marker}: the killing assertion must require the outcome its record declares, "${declared.status}"`
        ).toContain(declared.status);
      }
      expect(
        exact.flatMap((entry) => entry.says),
        `${marker}: the killing assertion must require the words its record declares, ${JSON.stringify(declared.says)}`
      ).toContain(declared.says);
    }
  }
});
