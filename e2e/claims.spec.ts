import { expect, test } from '@playwright/test';

const SHELF_RECORDS = 65_536;

function foldedCount(text: string): number {
  const match = text.match(/folded ([\d,]+) of ([\d,]+) records/);
  expect(match, `a server tile reports a measured fold: ${text}`).not.toBeNull();
  return Number((match as RegExpMatchArray)[1].replaceAll(',', ''));
}

test('honest PIR output equals the indexed shelf record', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  const alpha = Number(await page.locator('#shelf-alpha').inputValue());
  await expect(page.locator('#pir-awaiting')).toBeVisible();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-awaiting')).toBeHidden();
  await expect(page.locator('[data-verdict="record-match"]')).toHaveAttribute('data-status', 'pass');
  await expect(page.locator('#server-zero-progress')).toHaveJSProperty('value', SHELF_RECORDS);
  await expect(page.locator('#server-one-progress')).toHaveJSProperty('value', SHELF_RECORDS);
  const retrieved = await page.locator('#retrieved-record').textContent();
  const expected = await page.locator('#expected-record').textContent();
  expect(alpha).toBe(41337);
  expect(retrieved).toBe(expected);
  // The record verdict states a measurement, so check the measurement too.
  await expect(page.locator('[data-verdict="record-match"]')).toHaveText(
    new RegExp(`match with shelf\\[α\\] across all ${(expected ?? '').length / 2} bytes`)
  );
});

test('each server view verdict reports its own measured fold, not a fixed line', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();

  const zero = page.locator('[data-verdict="server-view-0"]');
  const one = page.locator('[data-verdict="server-view-1"]');
  await expect(zero).toHaveAttribute('data-status', 'pass');
  await expect(one).toHaveAttribute('data-status', 'pass');
  await expect(zero).toContainText('one party-0 key of 290 B');
  await expect(one).toContainText('one party-1 key of 290 B');

  const foldedZero = foldedCount((await zero.textContent()) ?? '');
  const foldedOne = foldedCount((await one.textContent()) ?? '');
  // Neither view is alpha-blind if it folded one record or the whole shelf, and
  // the two shares differ in exactly the one position the point function marks.
  expect(foldedZero).toBeGreaterThan(1);
  expect(foldedZero).toBeLessThan(SHELF_RECORDS);
  expect(foldedOne).toBeGreaterThan(1);
  expect(foldedOne).toBeLessThan(SHELF_RECORDS);
  expect(Math.abs(foldedZero - foldedOne)).toBe(1);

  await expect(page.locator('[data-verdict="collusion-state"]')).toHaveAttribute('data-status', 'pass');
  await expect(page.locator('[data-verdict="collusion-state"]')).toContainText('Collusion is off');
});

test('the collusion state verdict follows the live trust boundary', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  await page.locator('#collusion-toggle').check();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();
  await expect(page.locator('[data-verdict="collusion-state"]')).toHaveAttribute('data-status', 'alarm');
  await expect(page.locator('[data-verdict="collusion-state"]')).toContainText('Collusion is ON');
  await expect(page.locator('#privacy-verdicts [data-status="pass"]')).toHaveCount(2);
});

test('rendered leaf shares XOR to one point at the displayed alpha', async ({ page }) => {
  await page.goto('.');
  const alpha = Number(await page.locator('#alpha-value').textContent());
  const share0 = await page.locator('#tree-zero .node-bit').allTextContents();
  const share1 = await page.locator('#tree-one .node-bit').allTextContents();
  const reconstruction = share0.map((bit, index) => Number(bit) ^ Number(share1[index]));
  expect(reconstruction.filter((bit) => bit === 1)).toHaveLength(1);
  expect(reconstruction[alpha]).toBe(1);
  expect(await page.locator('#tree-xor .node-bit').allTextContents()).toEqual(reconstruction.map(String));
  // The headline verdict must report the index the shares actually reconstruct.
  await expect(page.locator('[data-verdict="tree-point"]')).toHaveAttribute('data-status', 'pass');
  await expect(page.locator('[data-verdict="tree-point"]')).toContainText('ONE LIT POINT AT');
  expect(Number(await page.locator('#tree-alpha-verdict').textContent())).toBe(reconstruction.indexOf(1));
});

test('displayed serialized size, formula, and parts agree with the hex dump', async ({ page }) => {
  await page.goto('.');
  const measured = Number(await page.locator('#key-bytes').getAttribute('data-count'));
  const hex = (await page.locator('#meter-key-hex').textContent()) ?? '';
  expect(hex.length / 2).toBe(measured);
  const root = Number.parseInt((await page.locator('#part-root').textContent()) ?? '');
  const levels = Number.parseInt((await page.locator('#part-levels').textContent()) ?? '');
  const final = Number.parseInt((await page.locator('#part-final').textContent()) ?? '');
  expect(root + levels + final).toBe(measured);
  const formula = (await page.locator('#size-formula').textContent()) ?? '';
  const values = formula.match(/[\d,]+/g)?.map((value) => Number(value.replaceAll(',', ''))) ?? [];
  expect(values).toEqual([17, 17, 65_536, 1, 290]);
  const domainBits = Number(await page.locator('#size-domain').inputValue());
  expect(formula).toContain('log₂ 65,536');
  expect(root + 17 * domainBits + final).toBe(measured);
});

test('changing alpha retires stale output while a no-op does not', async ({ page }) => {
  await page.goto('.');
  const slider = page.locator('#alpha-range');
  await slider.dispatchEvent('input');
  await expect(page.locator('#retirement')).toBeHidden();
  await slider.fill('4');
  await expect(page.locator('#retirement')).toContainText('Previous reconstruction for α = 11 retired');
  await expect(page.locator('#tree-alpha-verdict')).toHaveText('4');
  await expect(page.locator('[data-verdict="tree-point"]')).toHaveAttribute('data-status', 'pass');
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
  await expect(page.locator('[data-verdict="record-match"]')).toHaveAttribute('data-status', 'alarm');
  await expect(page.locator('[data-verdict="record-match"]')).toHaveText(/RETRIEVED — AND WRONG/);

  const expectedBytes = expected.match(/../g) ?? [];
  const actual = (retrieved.match(/../g) ?? []).filter((byte, index) => byte !== expectedBytes[index]).length;
  await expect(page.locator('[data-verdict="record-match"]')).toContainText(
    `${actual} of ${expectedBytes.length} bytes differ`
  );
});

test('the negative claim reports the run that exercised it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  await page.locator('#tamper-toggle').check();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();

  // Evidence from this run, not standing prose: the status has to be the one a
  // silently-accepted corruption produces, and the byte count has to be real.
  const claim = page.locator('[data-verdict="no-authentication"]');
  await expect(claim).toHaveAttribute('data-status', 'alarm');
  await expect(claim).toContainText('does not authenticate what is returned');
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
  await expect(page.locator('[data-verdict="no-authentication"]')).toHaveAttribute('data-status', 'unexercised');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();
  await expect(page.locator('[data-verdict="no-authentication"]')).toHaveAttribute('data-status', 'unexercised');
  await expect(page.locator('#integrity-evidence')).toContainText('no answer was altered');
});
