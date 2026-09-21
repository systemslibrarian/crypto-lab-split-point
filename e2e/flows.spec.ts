import { expect, test } from '@playwright/test';

test('tree stepper exposes each real expansion level', async ({ page }) => {
  await page.goto('.');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.locator('#step-value')).toHaveText('3 / 4');
  await expect(page.locator('#tree-zero .tree-node')).toHaveCount(8);
  await page.getByRole('button', { name: 'Next level' }).click();
  await expect(page.locator('#tree-zero .tree-node')).toHaveCount(16);
});

test('moving alpha regenerates both keys and moves only the combined point', async ({ page }) => {
  await page.goto('.');
  const before = await page.locator('#serialized-key-hex').textContent();
  await page.locator('#alpha-range').fill('3');
  await expect(page.locator('#tree-alpha-verdict')).toHaveText('3');
  const litIndex = await page.locator('#tree-xor .tree-node').evaluateAll((nodes) => nodes.findIndex((node) => node.classList.contains('node-lit')));
  expect(litIndex).toBe(3);
  expect(await page.locator('#serialized-key-hex').textContent()).not.toBe(before);
});

test('collusion deliberately exposes alpha and switching it off removes the alarm', async ({ page }) => {
  await page.goto('.');
  await page.locator('#collusion-toggle').check();
  const joined = page.locator('[data-verdict="collusion-recovery"]');
  await expect(joined).toHaveAttribute('data-status', 'alarm');
  await expect(joined).toContainText('SERVER SEES α = 11');
  // The exposed index is the one the joined view reconstructs, not the slider's.
  const lit = await page.locator('.collusion-bits .tree-node').evaluateAll((nodes) =>
    nodes.findIndex((node) => node.classList.contains('node-lit'))
  );
  expect(lit).toBe(11);

  await page.locator('#collusion-toggle').uncheck();
  await expect(page.locator('.collusion-alarm')).toHaveCount(0);
  const alone = page.locator('[data-verdict="single-share"]');
  await expect(alone).toHaveAttribute('data-status', 'pass');
  // "One key hides α" is rendered as a measured lit count over the real share.
  const text = (await alone.textContent()) ?? '';
  const counted = text.match(/lights (\d+) of (\d+) leaves/);
  expect(counted, `the single-share verdict reports a measured count: ${text}`).not.toBeNull();
  const [, litLeaves, totalLeaves] = counted as RegExpMatchArray;
  expect(Number(totalLeaves)).toBe(16);
  expect(Number(litLeaves)).not.toBe(1);
  expect(Number(litLeaves)).toBeGreaterThan(0);
});

test('invalid shelf alpha fails closed with its cause', async ({ page }) => {
  await page.goto('.');
  await page.locator('#shelf-alpha').fill('65536');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#shelf-alpha')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#fetch-status')).toContainText('0 to 65535');
  await expect(page.locator('#pir-result')).toBeHidden();
});

test('skip link is first and targets the app', async ({ page }) => {
  await page.goto('.');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveClass(/cl-skip-link/);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#app');
});