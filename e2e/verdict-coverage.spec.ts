import { expect, test, type Page } from '@playwright/test';
import {
  claimValues,
  findStrayMeasurements,
  findStrayVerdicts,
  markerStatuses,
  renderedClaims,
  renderedMarkers
} from './verdict-scan';
import { REGISTRY } from './verdict-ledger';

// Whether each registered mutation is actually killed THROUGH expectVerdict or
// expectClaim is asserted in e2e/verdict-ledger.spec.ts, over the triples those
// helpers recorded as they ran. It used to be asserted here as a regex over
// spec source, and source cannot tell a live assertion from a commented-out
// one, from one in an unrelated test, or from one handed the page's own values.

interface Walk {
  markers: Set<string>;
  claims: Set<string>;
  statuses: Record<string, string>;
  values: Record<string, string>;
}

/**
 * The DENOMINATOR, not a test. Both coverage rules below and the two stray scans
 * enumerate over whatever this walk reaches, so anything renderable only at a
 * control setting it never visits is outside the set they judge.
 *
 * The rule it follows: visit every option of every control that changes what
 * renders, each control on its own, never the cross-product. For this lab that
 * is 16 secret indices, 5 expansion levels, a key regeneration, 4 domain sizes,
 * both collusion states, both tamper states, and both classes of shelf index —
 * the in-range fetch and the rejection. `#shelf-alpha` is a 65,536-value number
 * input rather than a fixed option set, so its two rendering classes stand in
 * for its options; every other control here is enumerable and is enumerated.
 * The key inspector's disclosure is opened because the scans skip what has no
 * client rects, so leaving it closed would hide its contents from them.
 */
async function driveEveryState(page: Page, observe: (page: Page) => Promise<void> = async () => {}): Promise<Walk> {
  const walk: Walk = { markers: new Set(), claims: new Set(), statuses: {}, values: {} };
  const sample = async (): Promise<void> => {
    for (const marker of await renderedMarkers(page)) walk.markers.add(marker);
    for (const claim of await renderedClaims(page)) walk.claims.add(claim);
    Object.assign(walk.statuses, await markerStatuses(page));
    Object.assign(walk.values, await claimValues(page));
    await observe(page);
  };

  await page.goto('.');
  await sample();

  // The serialized key dump only has client rects once the disclosure is open.
  await page.locator('.key-inspector summary').click();
  await sample();

  // #alpha-range — every secret index it offers.
  const range = page.locator('#alpha-range');
  const lowest = Number(await range.getAttribute('min'));
  const highest = Number(await range.getAttribute('max'));
  for (let alpha = lowest; alpha <= highest; alpha += 1) {
    await range.fill(String(alpha));
    await expect(page.locator('#tree-alpha-verdict')).toHaveText(String(alpha));
    await sample();
  }

  // The expansion stepper — every level, down and back up.
  const levels = Number((await page.locator('#step-value').textContent())?.split('/')[1]?.trim() ?? '4');
  for (let level = levels - 1; level >= 0; level -= 1) {
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page.locator('#step-value')).toHaveText(`${level} / ${levels}`);
    await sample();
  }
  for (let level = 1; level <= levels; level += 1) {
    await page.getByRole('button', { name: 'Next level' }).click();
    await expect(page.locator('#step-value')).toHaveText(`${level} / ${levels}`);
    await sample();
  }

  // #new-keys — one option, exercised once.
  await page.locator('#new-keys').click();
  await sample();

  // #size-domain — every domain the meter offers.
  const domains = await page
    .locator('#size-domain option')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  for (const domain of domains) {
    await page.locator('#size-domain').selectOption(domain);
    await expect(page.locator('[data-claim="key-size-formula"]')).toContainText(
      (2 ** Number(domain)).toLocaleString()
    );
    await sample();
  }

  // #collusion-toggle — both states, which repaint the trust-boundary view.
  await page.locator('#collusion-toggle').check();
  await expect(page.locator('[data-verdict="collusion-recovery"]')).toBeVisible();
  await sample();
  await page.locator('#collusion-toggle').uncheck();
  await expect(page.locator('[data-verdict="single-share"]')).toBeVisible();
  await sample();

  // #shelf-alpha — the rejected class first, which renders no result at all.
  await page.locator('#shelf-alpha').fill('65536');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#shelf-alpha')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#pir-result')).toBeHidden();
  await sample();

  // ...and an in-range index, which is also #fetch-record's honest state.
  await page.locator('#shelf-alpha').fill('7');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#pir-result')).toBeVisible();
  await expect(page.locator('[data-verdict="record-match"]')).toHaveAttribute('data-status', 'pass');
  await sample();

  // #tamper-toggle — on, with its own fetch.
  await page.locator('#tamper-toggle').check();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('[data-verdict="record-match"]')).toHaveAttribute('data-status', 'alarm');
  await expect(page.locator('[data-verdict="no-authentication"]')).toHaveAttribute('data-status', 'alarm');
  await sample();
  await page.locator('#tamper-toggle').uncheck();

  // #collusion-toggle again, this time through a fetch, for the tile it paints.
  await page.locator('#collusion-toggle').check();
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('[data-verdict="collusion-state"]')).toHaveAttribute('data-status', 'alarm');
  await sample();
  await page.locator('#collusion-toggle').uncheck();
  await sample();

  return walk;
}

test('every verdict and every measurement the page renders has a mutation covering it', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await driveEveryState(page);

  const renderedVerdicts = [...seen.markers].sort();
  const registeredVerdicts = Object.keys(REGISTRY.markers).sort();
  expect(
    renderedVerdicts.filter((marker) => !registeredVerdicts.includes(marker)),
    'rendered verdict markers with no §4.1c mutation in e2e/verdict-mutations.json'
  ).toEqual([]);
  expect(
    registeredVerdicts.filter((marker) => !renderedVerdicts.includes(marker)),
    'mutations registered for verdicts this page never renders'
  ).toEqual([]);

  // Measurement markers are in the same loop on the same terms: a rendered
  // number with no mutation record fails, and a record naming a claim the page
  // no longer renders fails too.
  const renderedClaimIds = [...seen.claims].sort();
  const registeredClaims = Object.keys(REGISTRY.claims).sort();
  expect(
    renderedClaimIds.filter((claim) => !registeredClaims.includes(claim)),
    'rendered data-claim measurements with no §4.1c mutation in e2e/verdict-mutations.json'
  ).toEqual([]);
  expect(
    registeredClaims.filter((claim) => !renderedClaimIds.includes(claim)),
    'mutations registered for measurements this page never renders'
  ).toEqual([]);

  // A marker on an empty element would satisfy the lists above while showing
  // nothing, so require each one to carry a rendered outcome or value.
  expect(Object.keys(seen.statuses).sort(), 'every verdict marker renders an outcome').toEqual(renderedVerdicts);
  for (const [marker, status] of Object.entries(seen.statuses)) {
    expect(status, `${marker} carries a data-status`).not.toBe('');
  }
  expect(Object.keys(seen.values).sort(), 'every claim marker renders words').toEqual(renderedClaimIds);
  for (const [claim, value] of Object.entries(seen.values)) {
    expect(
      value !== '' && Number.isFinite(Number(value)),
      `${claim} carries a numeric data-value, got "${value}"`
    ).toBe(true);
  }
});

test('no verdict word or verdict styling is rendered outside a marker', async ({ page }) => {
  test.setTimeout(300_000);
  const strays: unknown[] = [];
  await driveEveryState(page, async (live) => {
    strays.push(...(await findStrayVerdicts(live)));
  });
  expect(strays, `unmarked verdicts on the page: ${JSON.stringify(strays, null, 2)}`).toEqual([]);
});

test('no measurement is rendered outside a marker', async ({ page }) => {
  test.setTimeout(300_000);
  const strays: unknown[] = [];
  await driveEveryState(page, async (live) => {
    strays.push(...(await findStrayMeasurements(live)));
  });
  expect(strays, `unmarked measurements on the page: ${JSON.stringify(strays, null, 2)}`).toEqual([]);
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

test('the measurement scan catches an unmarked number, with a unit or bare in a stat cell', async ({ page }) => {
  await page.goto('.');
  expect(await findStrayMeasurements(page), 'the page starts clean').toEqual([]);

  await page.evaluate(() => {
    const line = document.createElement('div');
    line.id = 'injected-measurement';
    line.textContent = '1,632 B';
    document.querySelector('.meter-layout')?.append(line);
  });
  expect(
    (await findStrayMeasurements(page)).map((stray) => stray.id),
    'a number with a unit is caught'
  ).toContain('injected-measurement');

  await page.evaluate(() => {
    document.getElementById('injected-measurement')?.remove();
    const cell = document.createElement('dd');
    cell.id = 'injected-stat';
    cell.textContent = '4,096';
    document.querySelector('.parts-list div')?.append(cell);
  });
  expect(
    (await findStrayMeasurements(page)).map((stray) => stray.id),
    'a bare integer in a stats cell is caught'
  ).toContain('injected-stat');
});

test('both stray scans clear the same injections once they are marked and covered', async ({ page }) => {
  await page.goto('.');
  await page.evaluate(() => {
    const banner = document.createElement('div');
    banner.className = 'verdict verdict-pass';
    banner.id = 'injected-marked-banner';
    banner.setAttribute('data-verdict', 'injected');
    banner.setAttribute('data-status', 'pass');
    banner.textContent = 'PROOF ACCEPTED';
    document.querySelector('main')?.append(banner);
    const line = document.createElement('div');
    line.id = 'injected-marked-measurement';
    line.setAttribute('data-claim', 'injected-size');
    line.setAttribute('data-value', '1632');
    line.textContent = '1,632 B';
    document.querySelector('.meter-layout')?.append(line);
  });
  expect(await findStrayVerdicts(page), 'the verdict scan is not unconditionally red').toEqual([]);
  expect(await findStrayMeasurements(page), 'the measurement scan is not unconditionally red').toEqual([]);
  // ...and the coverage walk still sees both, so marking alone does not hide them.
  expect(await renderedMarkers(page)).toContain('injected');
  expect(await renderedClaims(page)).toContain('injected-size');
});
