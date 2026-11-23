import { describe, expect, it } from 'vitest';

import { CARD_ACCENT_MIN_CONTRAST, contrastRatio, resolveCardAccent } from '@chatic/block-kit';

import { contrast } from './app/shared/theme/shellPalette';
import { avatarStyle } from './app/shared/utils/avatarColor';
import { darkPage as dark, lightPage as light, ratio, resolve, tokensOf } from './testing/cssTokens';

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
    ['background', 'foreground', 4.5],
    ['focus-ring', 'background', 3],
    ['focus-border', 'background', 3],
    ['control-border', 'background', 3],
    ['control-border', 'card', 3],
    ['control-border', 'popover', 3],
    ['input-border', 'surface', 3],
    ['background', 'control-border', 3],
    ['primary-ink', 'card', 3],
    ['primary-foreground', 'primary', 3],
    ['foreground', 'card', 4.5],
    ['label', 'card', 4.5],
    ['description', 'card', 4.5],
    ['description', 'well', 4.5],
    ['link', 'card', 4.5],
    ['label', 'well', 4.5],
];

describe.each([
    ['light', light],
    ['dark', dark],
])('%s theme tokens', (_, tokens) => {
    it.each(PAIRS)('--%s on --%s clears %s:1', (fg, bg, minimum) => {
        expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(minimum);
    });
});

it('draws the Mist sample card in dark mode with the dark shell', () => {
    const card = tokensOf(".dark [data-palette-preview='mist']");
    for (const name of ['rail', 'rail-elevated', 'sidebar']) expect(card[name]).toBe(dark[name]);
});

describe.each([
    ['light', light],
    ['dark', dark],
])('%s theme avatar initials', (_, tokens) => {
    const fill = avatarStyle('any').backgroundColor;
    const saturation = fill.match(/^hsl\(\d+ (\d+%) var\(--avatar-l\)\)$/)?.[1];

    it('reads the fill formula from avatarStyle', () => {
        expect(saturation).toBeDefined();
    });

    it('clears 4.5:1 on every hue', () => {
        const fg = resolve(tokens, 'avatar-fg');
        const weakest = Math.min(
            ...Array.from({ length: 360 }, (_, hue) => contrast(fg, `${hue} ${saturation} ${tokens['avatar-l']}`))
        );
        expect(weakest).toBeGreaterThanOrEqual(4.5);
    });
});

const hexOf = (hsl: string): string => {
    const [h, s, l] = hsl.split(/\s+/).map(parseFloat) as [number, number, number];
    const [S, L] = [s / 100, l / 100];
    const k = (n: number) => (n + h / 30) % 12;
    const f = (n: number) => L - S * Math.min(L, 1 - L) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return (
        '#' +
        [0, 8, 4]
            .map(n =>
                Math.round(f(n) * 255)
                    .toString(16)
                    .padStart(2, '0')
            )
            .join('')
    );
};

describe.each([
    ['light', light, 'light'],
    ['dark', dark, 'dark'],
] as const)('%s theme webhook card accent', (_, tokens, theme) => {
    const card = hexOf(resolve(tokens, 'card'));

    it.each(['danger', 'warning', 'good', '#6A52E0', '#FFB71B', '#00FF00', '#0000FF', '#1F2A6B', '#FFFF00'])(
        'a %s link clears 4.5:1 on --card',
        color => {
            const accent = resolveCardAccent(color);
            expect(accent).not.toBeNull();
            expect(contrastRatio(accent?.[theme].link as string, card)).toBeGreaterThanOrEqual(
                CARD_ACCENT_MIN_CONTRAST
            );
        }
    );
});
