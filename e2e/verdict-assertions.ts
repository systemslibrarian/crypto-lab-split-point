import { expect, type Page } from '@playwright/test';

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
 * `tone` is checked as the painted background rather than as a class name,
 * because that is what a reader sees and because the two verdict families style
 * themselves differently: `.verdict` switches class, `.mini-verdict` switches on
 * `[data-status]`. The plates are the same two colours the stray scan looks for.
 */

export type VerdictTone = 'pass' | 'alarm';

const PLATE: Record<VerdictTone, string> = {
  pass: 'rgb(15, 53, 43)',
  alarm: 'rgb(66, 29, 36)'
};

export interface VerdictExpectation {
  /** Text the marker must contain — every fragment, all of them required. */
  text: string | RegExp | ReadonlyArray<string | RegExp>;
  /** The machine-readable outcome in `data-status`. */
  status: string;
  /** The plate a reader sees. */
  tone: VerdictTone;
}

export async function expectVerdict(page: Page, id: string, expected: VerdictExpectation): Promise<void> {
  const marker = page.locator(`[data-verdict="${id}"]`);
  await expect(marker, `${id} renders exactly once`).toHaveCount(1);
  const fragments = Array.isArray(expected.text) ? expected.text : [expected.text];
  for (const fragment of fragments as ReadonlyArray<string | RegExp>) {
    await expect(marker, `${id} text`).toContainText(fragment as string & RegExp);
  }
  await expect(marker, `${id} data-status`).toHaveAttribute('data-status', expected.status);
  const painted = await marker.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(painted, `${id} is painted as ${expected.tone} while its text says "${fragments.join(' / ')}"`).toBe(
    PLATE[expected.tone]
  );
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
  return value;
}

/** The measured value behind a claim, for oracles that derive from it. */
export async function claimValue(page: Page, id: string): Promise<number> {
  const raw = await page.locator(`[data-claim="${id}"]`).getAttribute('data-value');
  expect(raw, `${id} carries a data-value`).not.toBeNull();
  return Number(raw);
}
