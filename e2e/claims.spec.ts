import { expect, test } from '@playwright/test';

test('honest PIR output equals the indexed shelf record', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  const alpha = Number(await page.locator('#shelf-alpha').inputValue());
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#record-verdict')).toHaveAttribute('data-status', 'pass');
  await expect(page.locator('#server-zero-progress')).toHaveJSProperty('value', 65_536);
  await expect(page.locator('#server-one-progress')).toHaveJSProperty('value', 65_536);
  const retrieved = await page.locator('#retrieved-record').textContent();
  const expected = await page.locator('#expected-record').textContent();
  expect(alpha).toBe(41337);
  expect(retrieved).toBe(expected);
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
  expect(await page.locator('#retrieved-record').textContent()).not.toBe(await page.locator('#expected-record').textContent());
  await expect(page.locator('#record-verdict')).toHaveText(/RETRIEVED — AND WRONG/);
  await expect(page.locator('#negative-claim')).toBeVisible();
  await expect(page.locator('#negative-claim')).toContainText('does not authenticate what is returned');
});