import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The denominator has to come from what RAN, not from what the source says ran.
 *
 * The rule this replaces was file-granular and read with a regex: a record
 * naming `e2e/claims.spec.ts` was satisfied by the string `expectVerdict(page,
 * 'record-match'` appearing ANYWHERE in that file — inside a comment, inside a
 * call asserting a different state in a different test, inside a call fed the
 * page's own values. All three of those shipped a live mutation green.
 *
 * So the helpers now append the `(spec, test, marker)` triples they actually
 * execute to a run-scoped sink, and `verdict-ledger.spec.ts` asserts that every
 * registry record's triple is in it. Playwright runs tests in separate worker
 * processes, so a module-level Set cannot aggregate; the sink is one append-only
 * file per process, cleared once per run in `global-setup.ts` and read back
 * after the whole suite by a project that `dependencies:` on it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(HERE, '..');
export const LEDGER_DIR = resolve(REPO_ROOT, 'test-results', 'verdict-ledger');

export type Family = 'verdict' | 'claim';

/**
 * What the registry pins about the assertion that kills a mutation. `spec` and
 * `test` are the triple's other two thirds. `status` and `says` are the parts of
 * the expectation the record DECIDES IN ADVANCE, so that an expectation read off
 * the page instead — which is indistinguishable from an honest one by
 * observation alone, on an unmutated tree — fails against the record.
 */
export interface Declaration {
  spec: string;
  test: string;
  /** The outcome the killing assertion must require. Verdict records only. */
  status?: string;
  /** One fragment the killing assertion must hand the helper verbatim. */
  says: string;
}

export interface MutationRecord {
  renders: string;
  computedFrom: string;
  mutation: string;
  expectedFlip: string;
  assertedBy: Declaration;
}

export interface Registry {
  note: string;
  markers: Record<string, MutationRecord>;
  claims: Record<string, MutationRecord>;
}

export const REGISTRY = JSON.parse(readFileSync(resolve(HERE, 'verdict-mutations.json'), 'utf8')) as Registry;

export function recordsFor(family: Family): Record<string, MutationRecord> {
  return family === 'verdict' ? REGISTRY.markers : REGISTRY.claims;
}

export function declarationFor(family: Family, marker: string): Declaration | undefined {
  return recordsFor(family)[marker]?.assertedBy;
}

export interface LedgerEntry {
  family: Family;
  marker: string;
  spec: string;
  test: string;
  /** The outcome the call required, for verdicts. */
  status?: string;
  /** The measured value the call required, for claims. */
  value?: number;
  /** Every text fragment the call handed the helper, as written. */
  says: string[];
}

/** A spec path as the registry writes it: repo-relative, forward slashes. */
export function specPathOf(file: string): string {
  return relative(REPO_ROOT, file).split(sep).join('/');
}

/** Fragments as SOURCES, so a RegExp is comparable and a page-read string is not. */
export function fragmentSources(text: unknown): string[] {
  const fragments = text === undefined ? [] : Array.isArray(text) ? text : [text];
  return (fragments as unknown[]).map((fragment) =>
    fragment instanceof RegExp ? `re:${fragment.source}` : String(fragment)
  );
}

let sink: string | undefined;

/** Append one executed triple. One file per process; one JSON object per line. */
export function recordAssertion(entry: LedgerEntry): void {
  if (sink === undefined) {
    mkdirSync(LEDGER_DIR, { recursive: true });
    sink = resolve(LEDGER_DIR, `worker-${process.pid}.jsonl`);
  }
  appendFileSync(sink, `${JSON.stringify(entry)}\n`, 'utf8');
}

/** Clear the sink at the start of a run, so a stale file can never be evidence. */
export function resetLedger(): void {
  rmSync(LEDGER_DIR, { recursive: true, force: true });
  mkdirSync(LEDGER_DIR, { recursive: true });
}

export function readLedger(): LedgerEntry[] {
  let files: string[];
  try {
    files = readdirSync(LEDGER_DIR);
  } catch {
    return [];
  }
  const entries: LedgerEntry[] = [];
  for (const name of files.filter((file) => file.endsWith('.jsonl'))) {
    const text = readFileSync(resolve(LEDGER_DIR, name), 'utf8');
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue;
      entries.push(JSON.parse(line) as LedgerEntry);
    }
  }
  return entries;
}
