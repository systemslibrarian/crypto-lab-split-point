import type { Page } from '@playwright/test';

export interface ContrastFailure {
  selector: string;
  text: string;
  ratio: number;
  required: number;
}

export async function auditContrast(page: Page): Promise<ContrastFailure[]> {
  return page.evaluate(() => {
    interface Rgb { r: number; g: number; b: number; a: number }
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const resolve = (color: string): Rgb | null => {
      context.fillStyle = '#010203';
      context.fillStyle = color;
      const first = context.fillStyle;
      context.fillStyle = '#fefdfc';
      context.fillStyle = color;
      if (first !== context.fillStyle) return null;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: alpha / 255 };
    };
    const over = (front: Rgb, back: Rgb): Rgb => {
      const alpha = front.a + back.a * (1 - front.a);
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (front.r * front.a + back.r * back.a * (1 - front.a)) / alpha,
        g: (front.g * front.a + back.g * back.a * (1 - front.a)) / alpha,
        b: (front.b * front.a + back.b * back.a * (1 - front.a)) / alpha,
        a: alpha
      };
    };
    const backdrop = (start: Element | null): Rgb => {
      let result: Rgb = { r: 0, g: 0, b: 0, a: 0 };
      for (let node = start; node; node = node.parentElement) {
        const paint = resolve(getComputedStyle(node).backgroundColor);
        if (paint) result = over(result, paint);
        if (result.a >= .999) break;
      }
      return over(result, { r: 255, g: 255, b: 255, a: 1 });
    };
    const luminance = (color: Rgb): number => {
      const channel = (value: number): number => {
        const normalized = value / 255;
        return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
      };
      return .2126 * channel(color.r) + .7152 * channel(color.g) + .0722 * channel(color.b);
    };
    const ratio = (left: Rgb, right: Rgb): number => {
      const a = luminance(left);
      const b = luminance(right);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    const selector = (node: Element): string => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.classList.length ? `.${Array.from(node.classList).join('.')}` : ''}`;
    const failures: ContrastFailure[] = [];
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (!node.checkVisibility?.({ checkVisibilityCSS: true }) || node.closest('[aria-hidden="true"]')) continue;
      const directText = Array.from(node.childNodes).filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent ?? '').join(' ').trim();
      if (!directText) continue;
      const style = getComputedStyle(node);
      const foreground = resolve(style.color);
      if (!foreground || foreground.a === 0) continue;
      const background = backdrop(node);
      const paintedForeground = over({ ...foreground, a: foreground.a * Number(style.opacity) }, background);
      const measured = ratio(paintedForeground, background);
      const size = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      if (measured + .01 < required) failures.push({ selector: selector(node), text: directText.slice(0, 80), ratio: measured, required });
    }
    return failures;
  });
}

export function formatContrastFailures(failures: ContrastFailure[]): string {
  return failures.map((failure) => `${failure.selector} (${failure.ratio.toFixed(2)}:${failure.required}) “${failure.text}”`).join('\n');
}