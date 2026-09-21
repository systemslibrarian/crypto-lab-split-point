import type { Page } from '@playwright/test';

/**
 * Coverage is derived by walking the rendered page. Nothing here trusts a list
 * written by whoever built an exhibit: the markers come out of the live DOM,
 * and the stray scan looks for anything that reads as an outcome while sitting
 * outside a marker — the raw banner a careless builder adds later.
 */

export interface StrayVerdict {
  tag: string;
  id: string;
  reason: string;
  text: string;
}

/** Every `data-verdict` the page can render, hidden containers included. */
export async function renderedMarkers(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-verdict]'), (node) => node.getAttribute('data-verdict') ?? '')
  );
}

/** Markers that also carry a rendered outcome, so a blank marker cannot pass. */
export async function markerStatuses(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const seen: Record<string, string> = {};
    for (const node of Array.from(document.querySelectorAll('[data-verdict]'))) {
      const id = node.getAttribute('data-verdict') ?? '';
      const status = node.getAttribute('data-status') ?? '';
      if ((node.textContent ?? '').trim().length > 0 || status.length > 0) seen[id] = status;
    }
    return seen;
  });
}

export async function findStrayVerdicts(page: Page): Promise<StrayVerdict[]> {
  return page.evaluate(() => {
    const VERDICT_CLASS = /(^|\s)(verdict|verdict-pass|verdict-alarm|mini-verdict|negative-claim)(\s|$)/;
    const VERDICT_WORDS =
      /\b(VALID|INVALID|ACCEPTED|REJECTED|VERIFIED|UNVERIFIED|FORGED|PASSED|FAILED|MATCHED|MISMATCH|RETRIEVED|RECOVERED|EXPOSED|SECURE|INSECURE|COMPROMISED|PROVEN|GREEN)\b/;
    // Verdict fills. Anything painted in the success or alarm plate is claiming
    // an outcome, whether or not it borrowed the class that defines them.
    const VERDICT_FILLS = new Set(['rgb(15, 53, 43)', 'rgb(66, 29, 36)']);
    const PROSE = 'p,li,summary,small,h1,h2,h3,h4,code,dd,dt,label,option,figcaption,blockquote';

    const strays: StrayVerdict[] = [];
    const describe = (node: Element, reason: string): void => {
      strays.push({
        tag: node.tagName.toLowerCase(),
        id: (node as HTMLElement).id,
        reason,
        text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
      });
    };

    for (const node of Array.from(document.querySelectorAll('body *'))) {
      if (node.closest('[data-verdict]') !== null) continue;
      if ((node as HTMLElement).getClientRects().length === 0) continue;

      const classes = node.getAttribute('class') ?? '';
      if (VERDICT_CLASS.test(classes)) {
        describe(node, `verdict styling (class "${classes}") outside a data-verdict marker`);
        continue;
      }
      if (VERDICT_FILLS.has(getComputedStyle(node).backgroundColor)) {
        describe(node, 'verdict plate colour outside a data-verdict marker');
        continue;
      }

      const own = Array.from(node.childNodes)
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (own.length === 0 || own.length > 120) continue;
      if (!VERDICT_WORDS.test(own)) continue;
      // Every verdict on this page is set in caps; that is what separates a
      // rendered outcome from the word "retrieved" appearing in a field label.
      const letters = own.replace(/[^A-Za-z]/g, '');
      if (letters.length === 0) continue;
      if (letters.replace(/[^A-Z]/g, '').length / letters.length < 0.8) continue;
      if (node.closest(PROSE) !== null) continue;
      describe(node, `verdict word rendered outside a data-verdict marker: "${own}"`);
    }
    return strays;
  });
}
