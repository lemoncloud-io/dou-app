import { describe, expect, it } from 'vitest';

import {
    CARD_ACCENT_GROUND,
    CARD_ACCENT_MIN_CONTRAST,
    contrastRatio,
    fitContrast,
    resolveCardAccent,
    type CardAccent,
} from './cardAccent';

const hueOf = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
};

const expectReadable = (accent: CardAccent) => {
    for (const theme of ['light', 'dark'] as const) {
        const colors = accent[theme];
        expect(contrastRatio(colors.link, CARD_ACCENT_GROUND[theme])).toBeGreaterThanOrEqual(CARD_ACCENT_MIN_CONTRAST);
        expect(contrastRatio(colors.badgeText, colors.badgeBackground)).toBeGreaterThanOrEqual(
            CARD_ACCENT_MIN_CONTRAST
        );
    }
};

const HEX_ONLY = /^#[0-9A-F]{6}$/;

describe('resolveCardAccent', () => {
    describe('names', () => {
        it.each(['danger', 'red', 'Danger', ' RED '])('reads %j as the design ERROR colour', color => {
            const accent = resolveCardAccent(color);
            expect(accent?.light.badgeBackground).toBe('#FDECEC');
            expectReadable(accent as CardAccent);
        });

        it.each(['good', 'green', 'GOOD'])('reads %j as the design ATTENDANCE colour', color => {
            const accent = resolveCardAccent(color);
            expect(accent?.light.badgeBackground).toBe('#E4F0EA');
            expectReadable(accent as CardAccent);
        });

        it.each(['warning', 'orange', 'Yellow'])('reads %j as the warning amber', color => {
            const accent = resolveCardAccent(color) as CardAccent;
            expect(accent).not.toBeNull();
            expect(Math.round(hueOf(accent.light.link))).toBeGreaterThanOrEqual(30);
            expect(Math.round(hueOf(accent.light.link))).toBeLessThanOrEqual(45);
            expectReadable(accent);
        });

        it('gives the three tones three different colours', () => {
            const links = ['danger', 'warning', 'good'].map(c => resolveCardAccent(c)?.light.link);
            expect(new Set(links).size).toBe(3);
        });
    });

    describe('hex', () => {
        it.each(['#FFB71B', 'ffb71b', '#ffb71b', '  #FfB71b  '])('reads %j, with or without #', color => {
            expect(resolveCardAccent(color)).toEqual(resolveCardAccent('#FFB71B'));
        });

        it('reads three digits as six', () => {
            expect(resolveCardAccent('#3a6')).toEqual(resolveCardAccent('#33aa66'));
        });

        it.each(['#6A52E0', '#FFB71B', '#00FF00', '#0000FF', '#FF00FF'])(
            'keeps the hue of %s and only moves its lightness, in both themes',
            color => {
                const accent = resolveCardAccent(color) as CardAccent;
                for (const theme of ['light', 'dark'] as const) {
                    expect(Math.abs(hueOf(accent[theme].link) - hueOf(color.toUpperCase()))).toBeLessThan(3);
                }
                expectReadable(accent);
            }
        );

        it('answers the same value the same way every time', () => {
            expect(resolveCardAccent('#6A52E0')).toBe(resolveCardAccent(' #6a52e0 '));
        });

        it('leaves a colour that already reads alone', () => {
            expect(resolveCardAccent('#1F4E8C')?.light.link).toBe('#1F4E8C');
        });

        it('lifts a dark colour for the dark card and darkens a light one for the light card', () => {
            const accent = resolveCardAccent('#FFB71B') as CardAccent;
            expect(accent.light.link).not.toBe('#FFB71B');
            expect(contrastRatio(accent.light.link, '#FFFFFF')).toBeGreaterThan(contrastRatio('#FFB71B', '#FFFFFF'));
            const navy = resolveCardAccent('#1F2A6B') as CardAccent;
            expect(contrastRatio(navy.dark.link, '#000000')).toBeGreaterThan(contrastRatio('#1F2A6B', '#000000'));
        });
    });

    describe('neutral', () => {
        it.each([
            ['nothing', undefined],
            ['null (a hidden message)', null],
            ['an empty string', '   '],
            ['a name outside the table', 'purple'],
            ['a name in another case outside the table', 'Blue'],
            ['a grey hex', '#808080'],
            ['a near-grey hex', '#8a8f8c'],
            ['white', '#fff'],
            ['a hex of the wrong length', '#ffff'],
            ['not hex', '#gggggg'],
            ['a number', 0xff0000],
            ['an object', { color: 'red' }],
            ['CSS a style would run', 'red; background:url(x)'],
            ['a CSS function', 'rgb(255,0,0)'],
            ['constructor', 'constructor'],
            ['__proto__', '__proto__'],
            ['toString in another case', 'ToString'],
            ['hasOwnProperty', 'hasOwnProperty'],
        ])('is neutral for %s', (_, color) => {
            expect(resolveCardAccent(color)).toBeNull();
        });
    });

    it('returns only computed six-digit colours, never the value that came in', () => {
        for (const color of ['Danger', 'warning', '#3a6', 'FFB71B', '#6a52e0']) {
            const accent = resolveCardAccent(color) as CardAccent;
            for (const theme of ['light', 'dark'] as const) {
                for (const value of Object.values(accent[theme])) {
                    expect(value).toMatch(HEX_ONLY);
                }
            }
        }
    });
});

describe('fitContrast', () => {
    it('reaches the minimum on a light ground by darkening', () => {
        const fitted = fitContrast('#FFFF00', '#FFFFFF') as string;
        expect(contrastRatio(fitted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    });

    it('reaches the minimum on a dark ground by lightening', () => {
        const fitted = fitContrast('#000080', '#1A1A1A') as string;
        expect(contrastRatio(fitted, '#1A1A1A')).toBeGreaterThanOrEqual(4.5);
    });

    it('measures black on white at 21:1', () => {
        expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    });

    it('gives nothing for a value that is not a hex colour', () => {
        expect(fitContrast('red', '#FFFFFF')).toBeNull();
        expect(fitContrast('#FFFFFF', 'url(x)')).toBeNull();
        expect(contrastRatio('red', '#FFFFFF')).toBeNaN();
    });
});
