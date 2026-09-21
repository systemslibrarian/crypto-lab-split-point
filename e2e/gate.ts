import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const NARROW = { width: 380, height: 800 };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`); });
  return errors;
}

export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().filter((animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity).length === 0, undefined, { timeout: 10_000 });
}

export async function boot(page: Page): Promise<void> {
  page.setDefaultTimeout(30_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[role="banner"]')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('#app')).toHaveCount(1);
  await expect(page.locator('.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#tree-zero .tree-node')).toHaveCount(16);
  await expect(page.locator('#tree-one .tree-node')).toHaveCount(16);
  await expect(page.locator('#tree-xor .node-lit')).toHaveCount(1);
  await expect(page.locator('#tamper-toggle')).not.toBeChecked();
  await expect(page.locator('#collusion-toggle')).not.toBeChecked();
  await expect(page.locator('#pir-result')).toBeHidden();
  await expect(page.locator('#theme-toggle,#themeToggle,.theme-toggle,.theme-toggle-btn,[data-theme-toggle]')).toHaveCount(0);
  await settle(page);
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(overflow.scrollWidth, `no horizontal document overflow in ${label}`).toBeLessThanOrEqual(overflow.clientWidth);
}

async function expectHiddenStaysHidden(page: Page, label: string): Promise<void> {
  const painted = await page.locator('[hidden]').evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display !== 'none').map((node) => (node as HTMLElement).id || node.tagName));
  expect(painted, `[hidden] elements remain unpainted in ${label}`).toEqual([]);
}

async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1).filter((node) => { const style = getComputedStyle(node); return ['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflowY); }).filter((node) => node.tabIndex < 0 && !node.querySelector('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')).map((node) => `${node.tagName.toLowerCase()}#${node.id}`));
  expect(unreachable, `scroll regions are keyboard reachable in ${label}`).toEqual([]);
}

export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNoHorizontalOverflow(page, label);
  await expectHiddenStaysHidden(page, label);
  await expectScrollersReachable(page, label);
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(wcag.violations, `axe WCAG violations in ${label}: ${JSON.stringify(wcag.violations, null, 2)}`).toEqual([]);
  expect(wcag.incomplete, `axe incomplete findings in ${label}: ${JSON.stringify(wcag.incomplete, null, 2)}`).toEqual([]);
  const bestPractice = await new AxeBuilder({ page }).withRules(['landmark-one-main', 'page-has-heading-one', 'skip-link']).analyze();
  expect(bestPractice.violations, `axe best-practice violations in ${label}`).toEqual([]);
  const contrast = await auditContrast(page);
  expect(contrast, formatContrastFailures(contrast)).toEqual([]);
  const nonText = await auditNonText(page);
  expect(nonText, JSON.stringify(nonText, null, 2)).toEqual([]);
  expect(Object.keys(NONTEXT_BASELINE), 'non-text baseline must remain empty').toEqual([]);
}

export async function driveAllStates(page: Page, label: string): Promise<void> {
  await scan(page, `${label}: arrival`);
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.locator('#step-value')).toHaveText('3 / 4');
  await scan(page, `${label}: intermediate tree level`);
  await page.locator('#alpha-range').fill('6');
  await expect(page.locator('#retirement')).toBeVisible();
  await expect(page.locator('#tree-xor .node-lit')).toHaveCount(1);
  await page.locator('.key-inspector summary').click();
  await scan(page, `${label}: regenerated keys and open disclosure`);
  await page.locator('#size-domain').selectOption('8');
  await scan(page, `${label}: resized query meter`);
  await page.locator('#shelf-alpha').fill('-1');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('#shelf-alpha')).toHaveAttribute('aria-invalid', 'true');
  await scan(page, `${label}: rejected alpha`);
  await page.locator('#collusion-toggle').check();
  await expect(page.locator('.collusion-alarm')).toContainText('SERVER SEES α');
  await scan(page, `${label}: collusion alarm`);
  // The alarm palette on the privacy tiles and the run-level negative claim only
  // paints when a fetch runs with both broken modes on, so scan that state too.
  await page.locator('#tamper-toggle').check();
  await page.locator('#shelf-alpha').fill('7');
  await page.getByRole('button', { name: 'Fetch privately' }).click();
  await expect(page.locator('[data-verdict="collusion-state"]')).toHaveAttribute('data-status', 'alarm');
  await expect(page.locator('[data-verdict="no-authentication"]')).toHaveAttribute('data-status', 'alarm');
  await scan(page, `${label}: colluding and tampered verdicts`);
  await page.locator('#tamper-toggle').uncheck();
  await page.locator('#collusion-toggle').uncheck();
  const closedScope = page.locator('.scope-columns details').nth(1);
  await closedScope.locator('summary').click();
  await scan(page, `${label}: non-goals disclosed`);
}