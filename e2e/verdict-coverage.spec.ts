import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { findStrayVerdicts, markerStatuses, renderedMarkers } from './verdict-scan';

const REGISTRY = JSON.parse(
  readFileSync(fileURLToPath(new URL('./verdict-mutations.json', import.meta.url)), 'utf8')
) as {
  markers: Record<string, { renders: string; computedFrom: string; mutation: string; expectedFlip: string; assertedBy: string }>;
};

const SPEC_SOURCES = new Map<string, string>();
function specSource(relative: string): string {
  const cached = SPEC_SOURCES.get(relative);
  if (cached !== undefined) return cached;
  const text = readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');
  SPEC_SOURCES.set(relative, text);
  return text;
}

/**
 * Drive the page through every state that can render a verdict, accumulating
 * what the DOM shows at each one. Coverage is taken off the rendered page, not
 * off anyone's enumeration of exhibits, and a verdict that only appears in one
 * broken-mode state still counts.
 */
async function driveEveryVerdict(
  page: Page,
  observe: (page: Page) => Promise<void> = async () => {}
): Promise<{ markers: Set<string>; statuses: Record<string, string> }> {
  const markers = new Set<string>();
  const statuses: Record<string, string> = {};
  const sample = async (): Promise<void> => {
    for (const marker of await renderedMarkers(page)) markers.add(marker);
    Object.assign(statuses, await markerStatuses(page));
    await observe(page);
  };

  await page.goto('.');
  await sample();

  await page.locator('#collusion-toggle').check();
  await expect(page.locator('[data-verdict="collusion-recovery"]')).toBeVisible();
  await sample();

  await page.locator('#collusion-toggle').uncheck();
  await expect(page.locator('[data-verdict="single-share"]')).toBeVisible();
  await sample();

  await page.locator('#tamper-toggle').check();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();
  await expect(page.locator('[data-verdict="record-match"]')).toHaveAttribute('data-status', /pass|alarm/);
  await sample();

  return { markers, statuses };
}

test('every verdict the page renders has a mutation covering it', async ({ page }) => {
  test.setTimeout(180_000);
  const seen = await driveEveryVerdict(page);
  const rendered = [...seen.markers].sort();
  const registered = Object.keys(REGISTRY.markers).sort();

  const uncovered = rendered.filter((marker) => !registered.includes(marker));
  expect(
    uncovered,
    `rendered verdict markers with no §4.1c mutation in e2e/verdict-mutations.json: ${JSON.stringify(uncovered)}`
  ).toEqual([]);

  const unrendered = registered.filter((marker) => !rendered.includes(marker));
  expect(
    unrendered,
    `mutations registered for verdicts this page never renders: ${JSON.stringify(unrendered)}`
  ).toEqual([]);

  // A marker on an empty element would satisfy the list above while showing
  // nothing, so require each one to carry a rendered outcome.
  expect(Object.keys(seen.statuses).sort(), 'every marker renders an outcome').toEqual(rendered);
  for (const [marker, status] of Object.entries(seen.statuses)) {
    expect(status, `${marker} carries a data-status`).not.toBe('');
  }
});

test('each registered mutation names a real assertion on its own marker', async () => {
  for (const [marker, entry] of Object.entries(REGISTRY.markers)) {
    expect(entry.mutation.length, `${marker} records a mutation`).toBeGreaterThan(20);
    expect(entry.expectedFlip.length, `${marker} records the flip it expects`).toBeGreaterThan(20);
    const source = specSource(entry.assertedBy);
    expect(source, `${entry.assertedBy} asserts on ${marker}`).toContain(marker);
  }
});

test('no verdict word or verdict styling is rendered outside a marker', async ({ page }) => {
  test.setTimeout(180_000);
  const strays: unknown[] = [];
  await driveEveryVerdict(page, async (live) => {
    strays.push(...(await findStrayVerdicts(live)));
  });
  expect(strays, `unmarked verdicts on the page: ${JSON.stringify(strays, null, 2)}`).toEqual([]);
});

test('the stray scan catches a raw unmarked banner, styled or worded', async ({ page }) => {
  await page.goto('.');
  expect(await findStrayVerdicts(page), 'the page starts clean').toEqual([]);

  await page.evaluate(() => {
    const banner = document.createElement('div');
    banner.className = 'verdict verdict-pass';
    banner.id = 'injected-styled-banner';
    banner.textContent = 'ALL CHECKS GREEN';
    document.querySelector('main')?.append(banner);
  });
  const styled = await findStrayVerdicts(page);
  expect(styled.map((stray) => stray.id), 'a copied verdict class is caught').toContain('injected-styled-banner');

  await page.evaluate(() => {
    document.getElementById('injected-styled-banner')?.remove();
    const banner = document.createElement('div');
    banner.id = 'injected-worded-banner';
    banner.textContent = 'PROOF ACCEPTED';
    document.querySelector('main')?.append(banner);
  });
  const worded = await findStrayVerdicts(page);
  expect(worded.map((stray) => stray.id), 'a bare worded banner is caught').toContain('injected-worded-banner');
});

test('the stray scan clears the same banner once it is marked and covered', async ({ page }) => {
  await page.goto('.');
  await page.evaluate(() => {
    const banner = document.createElement('div');
    banner.className = 'verdict verdict-pass';
    banner.id = 'injected-marked-banner';
    banner.setAttribute('data-verdict', 'injected');
    banner.setAttribute('data-status', 'pass');
    banner.textContent = 'PROOF ACCEPTED';
    document.querySelector('main')?.append(banner);
  });
  expect(await findStrayVerdicts(page), 'the scan is not unconditionally red').toEqual([]);
  // ...and the coverage walk still sees it, so marking alone does not hide it.
  expect(await renderedMarkers(page)).toContain('injected');
});
