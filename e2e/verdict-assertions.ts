import { expect, test, type Page } from '@playwright/test';
import { declarationFor, fragmentSources, recordAssertion, specPathOf, type Family } from './verdict-ledger';

/**
 * A marker's words and its state are ONE claim, so one call asserts all of it.
 *
 * Asserting text alone records a kill for a mutation that flips the sentence
 * while the plate stays green — the marker goes on claiming pass in every way a
 * reader can see except the words. This page sets `className` and
 * `dataset.status` in separate expressions, so those two really can disagree:
 * pinning `className` to `verdict-pass` leaves a green plate reading
 * "RETRIEVED — AND WRONG", and it survived the whole suite before this helper
 * existed.
 *
 * The plate is checked as the painted background rather than as a class name,
 * because that is what a reader sees and because the two verdict families style
 * themselves differently: `.verdict` switches class, `.mini-verdict` switches on
 * `[data-status]`. The plates are the same two colours the stray scan looks for.
 *
 * **The plate is DERIVED from the asserted outcome, never supplied.** It used to
 * be a `tone` argument, and a caller that read both off the page could then
 * assert "alarm words on a pass plate" as if that were the expected rendering —
 * which is exactly the state the `record-match` mutation produces. A reader is
 * never shown an alarm outcome on the success plate, so a test cannot expect one
 * either: the only expectation this helper accepts is that the plate agrees with
 * the outcome.
 *
 * Every call that passes appends the triple `(spec, test, marker)` it actually
 * executed to the run-scoped ledger. `verdict-ledger.spec.ts` reads those back
 * and fails when a registry record's triple is not among them, so "the mutation
 * is killed through the helper" is a statement about the run rather than about
 * the spec's source text.
 */

export type VerdictTone = 'pass' | 'alarm';

const PLATE: Record<VerdictTone, string> = {
  pass: 'rgb(15, 53, 43)',
  alarm: 'rgb(66, 29, 36)'
};

/**
 * Every outcome this page sets in `dataset.status`, and the plate each is
 * painted on. `pass` is the only one that earns the success plate: `mismatch`,
 * `contradicted` and `unexercised` are all states in which the page has NOT
 * demonstrated what the marker exists to demonstrate, and all three are styled
 * on the alarm plate. An outcome missing from this table fails rather than
 * defaulting, because a status the helper does not know is a status it cannot
 * check the paint against.
 */
const TONE_OF_STATUS: Record<string, VerdictTone> = {
  pass: 'pass',
  alarm: 'alarm',
  mismatch: 'alarm',
  contradicted: 'alarm',
  unexercised: 'alarm'
};

export interface VerdictExpectation {
  /** Text the marker must contain — every fragment, all of them required. */
  text: string | RegExp | ReadonlyArray<string | RegExp>;
  /** The machine-readable outcome in `data-status`. The plate follows from it. */
  status: string;
}

/**
 * When the executing triple is the one a registry record pins as the assertion
 * that kills its mutation, the record's own declaration is enforced against the
 * arguments before anything is read from the page.
 *
 * This is the only defence against a call that is kept but made tautological,
 * and it has to work this way round: on an unmutated tree an expectation read
 * off the page and an expectation decided in advance are THE SAME VALUES, so no
 * amount of observing the run can separate them. What separates them is that
 * the record decided part of the expectation before the run existed.
 */
function enforceDeclaration(family: Family, marker: string, asserted: { status?: string; says: string[] }): void {
  const declared = declarationFor(family, marker);
  if (declared === undefined) return;
  const info = test.info();
  if (declared.spec !== specPathOf(info.file) || declared.test !== info.title) return;

  if (declared.status !== undefined) {
    expect(
      asserted.status,
      `${marker}: e2e/verdict-mutations.json pins this test as the assertion that kills its mutation, and ` +
        `declares the outcome that assertion must require as "${declared.status}". It was handed ` +
        `"${asserted.status}". An expectation read off the page instead of decided in advance fails here.`
    ).toBe(declared.status);
  }
  expect(
    asserted.says,
    `${marker}: e2e/verdict-mutations.json declares the words this assertion must require — ` +
      `${JSON.stringify(declared.says)} — and it was handed ${JSON.stringify(asserted.says)}. The fragment ` +
      `has to be written in the test, not lifted out of the marker it is judging.`
  ).toContain(declared.says);
}

export async function expectVerdict(page: Page, id: string, expected: VerdictExpectation): Promise<void> {
  const says = fragmentSources(expected.text);
  enforceDeclaration('verdict', id, { status: expected.status, says });

  const tone = TONE_OF_STATUS[expected.status];
  expect(tone, `${id}: "${expected.status}" is not an outcome this page paints`).not.toBeUndefined();

  const marker = page.locator(`[data-verdict="${id}"]`);
  await expect(marker, `${id} renders exactly once`).toHaveCount(1);
  const fragments = Array.isArray(expected.text) ? expected.text : [expected.text];
  for (const fragment of fragments as ReadonlyArray<string | RegExp>) {
    await expect(marker, `${id} text`).toContainText(fragment as string & RegExp);
  }
  await expect(marker, `${id} data-status`).toHaveAttribute('data-status', expected.status);
  const painted = await marker.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(
    painted,
    `${id} is painted as ${tone === 'pass' ? 'alarm' : 'pass'} while its outcome is "${expected.status}" and ` +
      `its text says "${says.join(' / ')}"`
  ).toBe(PLATE[tone]);

  const info = test.info();
  recordAssertion({
    family: 'verdict',
    marker: id,
    spec: specPathOf(info.file),
    test: info.title,
    status: expected.status,
    says
  });
}

export interface ClaimExpectation {
  /** The measured value behind the words, in `data-value`. */
  value: number;
  /** Text fragments the marker must also contain. */
  text?: string | RegExp | ReadonlyArray<string | RegExp>;
}

/**
 * The measurement equivalent: the rendered sentence and the machine-readable
 * value are one claim too, so the value is asserted and the text is required to
 * actually state it. A marker whose `data-value` follows the measurement while
 * its words say something else is the same defect one family over.
 */
export async function expectClaim(page: Page, id: string, expected: ClaimExpectation): Promise<number> {
  const says = fragmentSources(expected.text);
  enforceDeclaration('claim', id, { says });

  const marker = page.locator(`[data-claim="${id}"]`);
  await expect(marker, `${id} renders exactly once`).toHaveCount(1);
  const raw = await marker.getAttribute('data-value');
  expect(raw, `${id} carries a data-value`).not.toBeNull();
  const value = Number(raw);
  expect(Number.isFinite(value), `${id} data-value is numeric, got ${raw}`).toBe(true);
  expect(value, `${id} measured value`).toBe(expected.value);
  const text = ((await marker.textContent()) ?? '').replace(/\s+/g, ' ');
  const plain = String(value);
  const grouped = value.toLocaleString('en-US');
  expect(
    text.includes(plain) || text.includes(grouped),
    `${id} states its own value: data-value ${plain} is not in "${text}"`
  ).toBe(true);
  const fragments = expected.text === undefined ? [] : Array.isArray(expected.text) ? expected.text : [expected.text];
  for (const fragment of fragments as ReadonlyArray<string | RegExp>) {
    await expect(marker, `${id} text`).toContainText(fragment as string & RegExp);
  }

  const info = test.info();
  recordAssertion({ family: 'claim', marker: id, spec: specPathOf(info.file), test: info.title, value, says });
  return value;
}

/** The measured value behind a claim, for oracles that derive from it. */
export async function claimValue(page: Page, id: string): Promise<number> {
  const raw = await page.locator(`[data-claim="${id}"]`).getAttribute('data-value');
  expect(raw, `${id} carries a data-value`).not.toBeNull();
  return Number(raw);
}
