import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The contrast contract of the theme tokens, measured from styles.css itself.
 *
 * The file states its ratios in comments, and twice a token drifted under AA while
 * its comment still claimed the old figure. These pairs are the ones the app draws
 * text or a focus indicator with; a value that breaks one fails here, not in review.
 */
const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

const tokensOf = (selector: string): Record<string, string> => {
    const start = css.indexOf(`${selector} {`);
    const body = css.slice(start, css.indexOf('\n    }', start));
    const tokens: Record<string, string> = {};
    for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
        const [, name, value] = match;
        if (name && value) tokens[name] = value.trim();
    }
    return tokens;
};

const light = tokensOf(':root');
const dark = { ...light, ...tokensOf('.dark') };

const resolve = (tokens: Record<string, string>, name: string): string => {
    const value = tokens[name];
    if (!value) throw new Error(`no --${name}`);
    const alias = value.match(/^var\(--([\w-]+)\)$/)?.[1];
    return alias ? resolve(tokens, alias) : value;
};

const luminance = (hsl: string): number => {
    const [h = 0, s = 0, l = 0] = hsl.split(/\s+/).map(part => parseFloat(part));
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const channel = (n: number) => {
        const k = (n + h / 30) % 12;
        const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
};

const ratio = (tokens: Record<string, string>, fg: string, bg: string): number => {
    const [a, b] = [luminance(resolve(tokens, fg)), luminance(resolve(tokens, bg))];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/** [foreground, background, minimum]: 4.5 for text, 3 for a focus indicator. */
const PAIRS: [string, string, number][] = [
    ['foreground', 'background', 4.5],
    ['muted-foreground', 'background', 4.5],
    ['muted-foreground', 'accent', 4.5],
    ['muted-foreground', 'input', 4.5],
    ['muted-foreground', 'well', 4.5],
    ['placeholder', 'background', 4.5],
    ['placeholder', 'card', 4.5],
    ['description', 'background', 4.5],
    ['destructive', 'background', 4.5],
    ['destructive', 'card', 4.5],
    ['destructive', 'accent', 4.5],
    ['destructive-foreground', 'destructive', 4.5],
    ['primary-ink', 'background', 4.5],
    ['link', 'background', 4.5],
    ['toast-foreground', 'toast', 4.5],
    ['toast-muted', 'toast', 4.5],
    // Tooltips (Hint) are ink: the page's own text colour as the ground.
    ['background', 'foreground', 4.5],
    ['focus-ring', 'background', 3],
    ['focus-border', 'background', 3],
];

describe.each([
    ['light', light],
    ['dark', dark],
])('%s theme tokens', (_, tokens) => {
    it.each(PAIRS)('--%s on --%s clears %s:1', (fg, bg, minimum) => {
        expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(minimum);
    });
});
