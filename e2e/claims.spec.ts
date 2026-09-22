import { expect, test, type Page } from '@playwright/test';
import { claimValue, expectClaim, expectVerdict } from './verdict-assertions';

const SHELF_RECORDS = 65_536;

function foldedCount(text: string): number {
  const match = text.match(/folded ([\d,]+) of ([\d,]+) records/);
  expect(match, `a server tile reports a measured fold: ${text}`).not.toBeNull();
  return Number((match as RegExpMatchArray)[1].replaceAll(',', ''));
}

/** The domain sizes the page itself offers, read off the control. */
async function domainOptions(page: Page): Promise<number[]> {
  return page
    .locator('#size-domain option')
    .evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLOptionElement).value)));
}

async function keyDump(page: Page, domainBits: number): Promise<string> {
  await page.locator('#size-domain').selectOption(String(domainBits));
  await expect(page.locator('[data-claim="key-bytes-total"]')).toHaveAttribute('data-value', /^\d+$/);
  const hex = (await page.locator('#meter-key-hex').textContent()) ?? '';
  expect(hex, `the key dump for 2^${domainBits} is hex`).toMatch(/^[0-9a-f]+$/);
  return hex;
}

/**
 * Walk the serialized key the way the serializer writes it: one correction word
 * per level, in stride, each ending in a two-bit control byte. Returns the words
 * actually present rather than a count derived by multiplying one size out.
 */
function readCorrectionWords(hex: string, rootBytes: number, wordBytes: number, finalBytes: number): number[] {
  const bytes = (hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16));
  const controls: number[] = [];
  for (let offset = rootBytes; offset + wordBytes <= bytes.length - finalBytes; offset += wordBytes) {
    controls.push(bytes[offset + wordBytes - 1]);
  }
  return controls;
}

test('honest PIR output equals the indexed shelf record', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  const alpha = Number(await page.locator('#shelf-alpha').inputValue());
  await expect(page.locator('#pir-awaiting')).toBeVisible();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-awaiting')).toBeHidden();
  await expect(page.locator('#server-zero-progress')).toHaveJSProperty('value', SHELF_RECORDS);
  await expect(page.locator('#server-one-progress')).toHaveJSProperty('value', SHELF_RECORDS);
  const retrieved = await page.locator('#retrieved-record').textContent();
  const expected = await page.locator('#expected-record').textContent();
  expect(alpha).toBe(41337);
  expect(retrieved).toBe(expected);
  // Words, state and plate are one claim, and the verdict states a measurement,
  // so the measurement is checked with them.
  await expectVerdict(page, 'record-match', {
    status: 'pass',
    text: [
      'RETRIEVED · byte-for-byte match with shelf[α]',
      new RegExp(`match with shelf\\[α\\] across all ${(expected ?? '').length / 2} bytes`)
    ]
  });
});

test('each server view verdict reports its own measured fold, not a fixed line', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  // The key size each tile states is the one the meter measured, not a literal.
  const keyBytes = await claimValue(page, 'key-bytes-total');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();

  await expectVerdict(page, 'server-view-0', {
    status: 'pass',
    text: [`one party-0 key of ${keyBytes} B`, /folded [\d,]+ of [\d,]+ records/]
  });
  await expectVerdict(page, 'server-view-1', {
    status: 'pass',
    text: [`one party-1 key of ${keyBytes} B`, /folded [\d,]+ of [\d,]+ records/]
  });

  const zero = page.locator('[data-verdict="server-view-0"]');
  const one = page.locator('[data-verdict="server-view-1"]');
  const foldedZero = foldedCount((await zero.textContent()) ?? '');
  const foldedOne = foldedCount((await one.textContent()) ?? '');
  // Neither view is alpha-blind if it folded one record or the whole shelf, and
  // the two shares differ in exactly the one position the point function marks.
  expect(foldedZero).toBeGreaterThan(1);
  expect(foldedZero).toBeLessThan(SHELF_RECORDS);
  expect(foldedOne).toBeGreaterThan(1);
  expect(foldedOne).toBeLessThan(SHELF_RECORDS);
  expect(Math.abs(foldedZero - foldedOne)).toBe(1);

  await expectVerdict(page, 'collusion-state', {
    status: 'pass',
    text: 'Collusion is off · neither key left its own server view'
  });
});

test('the collusion state verdict follows the live trust boundary', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  await page.locator('#collusion-toggle').check();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();
  await expectVerdict(page, 'collusion-state', {
    status: 'alarm',
    text: 'Collusion is ON · one view holds both keys'
  });
  await expect(page.locator('#privacy-verdicts [data-status="pass"]')).toHaveCount(2);
});

test('rendered leaf shares XOR to one point at the displayed alpha', async ({ page }) => {
  await page.goto('.');
  const alpha = Number(await page.locator('#alpha-value').textContent());
  const share0 = await page.locator('#tree-zero .node-bit').allTextContents();
  const share1 = await page.locator('#tree-one .node-bit').allTextContents();
  const reconstruction = share0.map((bit, index) => Number(bit) ^ Number(share1[index]));
  // The headline verdict must report the index the shares actually reconstruct,
  // and it is asserted FIRST. verdict-mutations.json records this test as the
  // one whose expectVerdict kills the direction-bit mutation, and every raw
  // assertion that used to sit above this line — the lit-bit count,
  // reconstruction[alpha], the #tree-xor readback — fails on that mutation
  // before the helper is ever reached, so the flip the record describes was a
  // flip no run had demonstrated.
  await expectVerdict(page, 'tree-point', {
    status: 'pass',
    text: ['ONE LIT POINT AT', String(reconstruction.indexOf(1))]
  });
  expect(reconstruction.filter((bit) => bit === 1)).toHaveLength(1);
  expect(reconstruction[alpha]).toBe(1);
  expect(await page.locator('#tree-xor .node-bit').allTextContents()).toEqual(reconstruction.map(String));
  expect(Number(await page.locator('#tree-alpha-verdict').textContent())).toBe(reconstruction.indexOf(1));
});

/**
 * Fix 4, in this lab's shape. The old oracle asserted
 * `root + 17 * domainBits + final === measured` at the single default domain: it
 * multiplied one per-level size out, with both the size and the level count
 * literals, where the serializer WRITES one correction word per level. It could
 * not tell "sixteen words of seventeen bytes" from "one 272-byte block", which
 * is exactly what the parts list claims, and it agreed only because the suite
 * never moved `#size-domain`. This walks every domain the control offers,
 * measures the per-level cost as the slope between those measurements, counts
 * the words actually present in the dump, and sums them.
 */
test('key-size claims are measured per level across every domain the page offers', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  const options = await domainOptions(page);
  expect(options.length, 'the meter offers more than one domain to derive a slope from').toBeGreaterThan(1);

  const totals = new Map<number, number>();
  for (const domainBits of options) {
    const hex = await keyDump(page, domainBits);
    totals.set(domainBits, hex.length / 2);
  }

  // Per-level cost, measured between domains rather than written down.
  const sorted = [...options].sort((left, right) => left - right);
  const slopes = sorted.slice(1).map((domainBits, index) => {
    const previous = sorted[index];
    return ((totals.get(domainBits) as number) - (totals.get(previous) as number)) / (domainBits - previous);
  });
  expect(new Set(slopes).size, `the key grows by one constant per level: ${JSON.stringify(slopes)}`).toBe(1);
  const perLevel = slopes[0];
  expect(Number.isInteger(perLevel) && perLevel > 1, `per-level cost is a whole number of bytes: ${perLevel}`).toBe(
    true
  );
  const lambdaBytes = perLevel - 1; // one correction word is a seed plus a control byte
  const expectedRoot = 1 + lambdaBytes; // one header byte plus the root seed

  for (const domainBits of sorted) {
    const domainSize = 2 ** domainBits;
    const hex = await keyDump(page, domainBits);
    const total = hex.length / 2;
    expect(total, `the dump for 2^${domainBits} is the size it was measured at`).toBe(totals.get(domainBits));

    const header = Number.parseInt(hex.slice(0, 2), 16);
    expect(header & 0x1f, "the dump's header names the domain under test").toBe(domainBits);

    const finalBytes = await expectClaim(page, 'key-part-final', { value: 1, text: 'B' });
    const controls = readCorrectionWords(hex, expectedRoot, perLevel, finalBytes);
    expect(
      controls.filter((control) => control > 3),
      `every stride-aligned correction word ends in two control bits at 2^${domainBits}`
    ).toEqual([]);
    expect(controls.length, `the key carries one correction word per level at 2^${domainBits}`).toBe(domainBits);
    const summedLevels = controls.reduce((sum) => sum + perLevel, 0);
    const lastByte = Number.parseInt(hex.slice(-2 * finalBytes), 16);
    expect(lastByte, 'the final correction is a bit').toBeLessThanOrEqual(1);

    await expectClaim(page, 'key-part-root', { value: expectedRoot, text: 'B' });
    await expectClaim(page, 'key-part-levels', { value: summedLevels, text: 'B' });
    await expectClaim(page, 'key-bytes-total', { value: total, text: 'B' });
    await expectClaim(page, 'dpf-key-bytes', { value: total, text: 'bytes' });
    expect(expectedRoot + summedLevels + finalBytes, `the parts account for every byte at 2^${domainBits}`).toBe(
      total
    );

    const chor = await expectClaim(page, 'chor-query-bytes', {
      value: domainSize / 8,
      text: ['bits', `${domainSize.toLocaleString()} bits`]
    });
    expect(chor * 8, 'the Chor baseline is one bit per record').toBe(domainSize);

    // Helper first, for the reason the tree-point call is first: the recorded
    // mutation pins the formula's total to a literal 290, and the raw
    // formulaNumbers comparison below catches that at every domain but the
    // default — before expectClaim is reached, leaving the record's flip a flip
    // no run demonstrated. expectClaim catches it on its own terms, because the
    // sentence stops stating the data-value beside it.
    await expectClaim(page, 'key-size-formula', { value: total, text: 'bytes' });
    const formulaText = (await page.locator('[data-claim="key-size-formula"]').textContent()) ?? '';
    const formulaNumbers = (formulaText.match(/[\d,]+/g) ?? []).map((value) => Number(value.replaceAll(',', '')));
    expect(formulaNumbers, `the formula states this domain's own measured parts: ${formulaText}`).toEqual([
      expectedRoot,
      perLevel,
      domainSize,
      finalBytes,
      total
    ]);
  }

  // The PRG width is measured from a real expansion, and λ is the one the key
  // sizes just revealed.
  await expectClaim(page, 'prg-node-width', { value: 2 * (lambdaBytes * 8 + 1), text: 'bits per node' });
});

test('changing alpha retires stale output while a no-op does not', async ({ page }) => {
  await page.goto('.');
  const slider = page.locator('#alpha-range');
  await slider.dispatchEvent('input');
  await expect(page.locator('#retirement')).toBeHidden();
  await slider.fill('4');
  await expect(page.locator('#retirement')).toContainText('Previous reconstruction for α = 11 retired');
  // Helper before readback here too: the readback fails on the same mutation.
  await expectVerdict(page, 'tree-point', { status: 'pass', text: ['ONE LIT POINT AT', '4'] });
  await expect(page.locator('#tree-alpha-verdict')).toHaveText('4');
  const paintedHidden = await page.locator('[hidden]').evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display !== 'none').length);
  expect(paintedHidden).toBe(0);
});

test('tampering violates integrity while every privacy verdict remains green', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  await page.locator('#tamper-toggle').check();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#privacy-verdicts [data-status="pass"]')).toHaveCount(3);
  await expect(page.locator('#collusion-toggle')).not.toBeChecked();
  await expect(page.locator('#tree-zero .node-lit, #tree-one .node-lit')).toHaveCount(0);
  const retrieved = (await page.locator('#retrieved-record').textContent()) ?? '';
  const expected = (await page.locator('#expected-record').textContent()) ?? '';
  expect(retrieved).not.toBe(expected);

  const expectedBytes = expected.match(/../g) ?? [];
  const actual = (retrieved.match(/../g) ?? []).filter((byte, index) => byte !== expectedBytes[index]).length;
  // A corrupted record must not be able to keep the green plate.
  await expectVerdict(page, 'record-match', {
    status: 'alarm',
    text: ['RETRIEVED — AND WRONG', `${actual} of ${expectedBytes.length} bytes differ`]
  });
});

test('the negative claim reports the run that exercised it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  await page.locator('#tamper-toggle').check();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();

  // Evidence from this run, not standing prose: the status has to be the one a
  // silently-accepted corruption produces, and the byte count has to be real.
  await expectVerdict(page, 'no-authentication', {
    status: 'alarm',
    text: 'does not authenticate what is returned'
  });
  const evidence = (await page.locator('#integrity-evidence').textContent()) ?? '';
  const claimed = Number(evidence.match(/and (\d+) of (\d+) bytes now differ/)?.[1] ?? NaN);
  const retrieved = (await page.locator('#retrieved-record').textContent()) ?? '';
  const expected = (await page.locator('#expected-record').textContent()) ?? '';
  const expectedBytes = expected.match(/../g) ?? [];
  const actual = (retrieved.match(/../g) ?? []).filter((byte, index) => byte !== expectedBytes[index]).length;
  expect(claimed).toBe(actual);
  expect(claimed).toBeGreaterThan(0);
  expect(evidence).toContain('raised nothing');
});

test('the negative claim says it was not exercised when nothing was tampered with', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  await expectVerdict(page, 'no-authentication', {
    status: 'unexercised',
    text: 'does not authenticate what is returned'
  });
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();
  await expectVerdict(page, 'no-authentication', {
    status: 'unexercised',
    text: 'does not authenticate what is returned'
  });
  await expect(page.locator('#integrity-evidence')).toContainText('no answer was altered');
});
