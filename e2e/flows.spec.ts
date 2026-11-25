import { expect, test } from '@playwright/test';
import { expectVerdict } from './verdict-assertions';

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
  await expectVerdict(page, 'collusion-recovery', {
    status: 'alarm',
    text: 'SERVER SEES α = 11'
  });
  // The exposed index is the one the joined view reconstructs, not the slider's.
  const lit = await page.locator('.collusion-bits .tree-node').evaluateAll((nodes) =>
    nodes.findIndex((node) => node.classList.contains('node-lit'))
  );
  expect(lit).toBe(11);

  await page.locator('#collusion-toggle').uncheck();
  await expect(page.locator('.collusion-alarm')).toHaveCount(0);
  const alone = page.locator('[data-verdict="single-share"]');
  const leaves = await page.locator('#tree-zero .node-bit').allTextContents();
  const count = leaves.filter(bit => bit === '1').length;
  await expectVerdict(page, 'single-share', {
    status: 'pass',
    text: ['ONE KEY ONLY', `k0 alone lights ${count} of ${leaves.length} leaves`]
  });
  await expect(alone).toContainText('ONE KEY ONLY');
});

test('invalid shelf alpha fails closed with its cause', async ({ page }) => {
  await page.goto('.');
  await page.locator('#shelf-alpha').fill('65536');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#shelf-alpha')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#fetch-status')).toContainText('0 to 65535');
  await expect(page.locator('#pir-result')).toBeHidden();
});

test('completed PIR evidence retires when any controlling input changes', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('.');
  const fetchAndExpectResult = async (): Promise<void> => {
    await page.getByRole('button', { name: 'Fetch privately' }).click();
    await expect(page.locator('#pir-result')).toBeVisible();
  };
  const expectRetired = async (cause: string): Promise<void> => {
    await expect(page.locator('#pir-result')).toBeHidden();
    await expect(page.locator('#pir-awaiting')).toBeVisible();
    await expect(page.locator('#privacy-verdicts')).toBeEmpty();
    await expect(page.locator('#record-verdict')).not.toHaveAttribute('data-status');
    await expect(page.locator('#fetch-status')).toContainText(cause);
  };

  await fetchAndExpectResult();
  await page.locator('#shelf-alpha').fill('41338');
  await expectRetired('shelf index changed');

  await fetchAndExpectResult();
  await page.locator('#tamper-toggle').check();
  await expectRetired('tamper setting changed');

  await fetchAndExpectResult();
  await page.locator('#collusion-toggle').check();
  await expectRetired('collusion setting changed');
});

test('a superseded in-flight scan cannot restore old evidence', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('.');
  await page.evaluate(() => {
    document.getElementById('fetch-record')?.click();
    const input = document.getElementById('shelf-alpha') as HTMLInputElement;
    input.value = '41338';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#fetch-status')).toContainText('shelf index changed');
  await expect(page.getByRole('button', { name: 'Fetch privately' })).toBeEnabled({ timeout: 120_000 });
  await expect(page.locator('#pir-result')).toBeHidden();
  await expect(page.locator('#pir-awaiting')).toBeVisible();
  await expect(page.locator('#privacy-verdicts')).toBeEmpty();
});

test('skip link is first and targets the app', async ({ page }) => {
  await page.goto('.');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveClass(/cl-skip-link/);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#app');
});

test('a blank shelf index is refused while explicit zero retrieves the first book', async ({ page }) => {
  await page.goto('.');
  const input = page.locator('#shelf-alpha');
  await input.fill('');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#retrieved-record')).toBeEmpty();
  await expect(page.locator('#server-zero-progress')).toHaveJSProperty('value', 0);
  await input.fill('0');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#retrieved-record')).toHaveText('00000000193e3ab51f37d0bf39b8eeb4', { timeout: 30000 });
  await expect(input).not.toHaveAttribute('aria-invalid');
});

test('a singleton server share can light a different leaf from the requested index', async ({ page }) => {
  // These two classroom root draws generate a single lit leaf at 10 in k0 for a query of 11.
  await page.addInitScript(() => {
    const random = crypto.getRandomValues.bind(crypto);
    let draw = 150;
    crypto.getRandomValues = function<T extends ArrayBufferView | null>(array: T): T {
      if (draw <= 151 && array instanceof Uint8Array && array.length === 16) {
        array.fill(0);
        new DataView(array.buffer, array.byteOffset, array.byteLength).setUint32(0, draw++);
        return array;
      }
      return random(array);
    };
  });
  await page.goto('.');
  const single = await page.locator('#tree-zero .node-bit').allTextContents();
  expect(single.join('')).toBe('0000000000100000');
  await expect(page.locator('#tree-alpha-verdict')).toHaveText('11');
  await expectVerdict(page, 'single-share', { status: 'pass', text: 'k0 alone lights 1 of 16 leaves' });
  await page.locator('#step-back').click();
  await expect(page.locator('#tree-xor .node-lit')).toHaveAttribute('aria-label', /node 5,.*prefix/);
  await page.locator('#step-next').click();
  await expect(page.locator('#tree-xor .node-lit')).toHaveAttribute('aria-label', /node 11,.*secret point/);
});

test('the initial HTML waits for reconstruction before showing a tree verdict', async ({ page }) => {
  await page.route('**/assets/*.js', route => route.abort());
  await page.goto('.');
  await expect(page.locator('#tree-verdict')).toContainText('Waiting');
  await expect(page.locator('#tree-verdict')).not.toHaveAttribute('data-status');
  await expect(page.locator('#tree-zero .node-bit')).toHaveCount(0);
});
