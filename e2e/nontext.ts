import type { Page } from '@playwright/test';

export interface NonTextFailure {
  selector: string;
  detail: string;
  ratio: number;
  required: number;
}

export async function auditNonText(page: Page): Promise<NonTextFailure[]> {
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
      return { r: (front.r * front.a + back.r * back.a * (1 - front.a)) / alpha, g: (front.g * front.a + back.g * back.a * (1 - front.a)) / alpha, b: (front.b * front.a + back.b * back.a * (1 - front.a)) / alpha, a: alpha };
    };
    const solidBackdrop = (start: Element | null): Rgb => {
      let result: Rgb = { r: 0, g: 0, b: 0, a: 0 };
      for (let node = start; node; node = node.parentElement) {
        const paint = resolve(getComputedStyle(node).backgroundColor);
        if (paint) result = over(result, paint);
        if (result.a >= .999) break;
      }
      return over(result, { r: 255, g: 255, b: 255, a: 1 });
    };
    const luminance = (color: Rgb): number => {
      const channel = (value: number): number => { const normalized = value / 255; return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; };
      return .2126 * channel(color.r) + .7152 * channel(color.g) + .0722 * channel(color.b);
    };
    const ratio = (left: Rgb, right: Rgb): number => { const a = luminance(left); const b = luminance(right); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const identify = (node: Element): string => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.classList.length ? `.${Array.from(node.classList).join('.')}` : ''}`;
    const failures: NonTextFailure[] = [];
    const controls = document.querySelectorAll<HTMLElement>('button,input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=tab],a.cl-btn');
    for (const control of Array.from(controls)) {
      if (!control.checkVisibility?.() || (control as HTMLButtonElement).disabled) continue;
      const style = getComputedStyle(control);
      const outside = solidBackdrop(control.parentElement);
      const fill = resolve(style.backgroundColor);
      const fillRatio = fill && fill.a > 0 ? ratio(over(fill, outside), outside) : 1;
      const sideNames = ['Top', 'Right', 'Bottom', 'Left'] as const;
      const paintedSides = sideNames.flatMap((side) => {
        const width = Number.parseFloat(style[`border${side}Width`]);
        const borderStyle = style[`border${side}Style`];
        const color = resolve(style[`border${side}Color`]);
        return width > 0 && borderStyle !== 'none' && borderStyle !== 'hidden' && color && color.a > 0 ? [ratio(over(color, outside), outside)] : [];
      });
      const borderRatio = paintedSides.length > 0 ? Math.max(...paintedSides) : 1;
      const isNativeRangeOrCheck = control.matches('input[type=range],input[type=checkbox],input[type=radio]');
      if (!isNativeRangeOrCheck && Math.max(fillRatio, borderRatio) + .01 < 3) {
        failures.push({ selector: identify(control), detail: `fill ${fillRatio.toFixed(2)}, strongest painted side ${borderRatio.toFixed(2)}`, ratio: Math.max(fillRatio, borderRatio), required: 3 });
      }
    }
    return failures;
  });
}