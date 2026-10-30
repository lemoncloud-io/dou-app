import { describe, expect, it } from 'vitest';

import { darkPage, lightPage, ratio, type Tokens } from '../../../testing/cssTokens';

import {
    contrast,
    derivePaletteTokens,
    luminance,
    OPEN_TILE_RATIO,
    PAGE_TOKENS,
    PRESET_COLORS,
    type ShellColors,
    type ShellMode,
    shellPaletteCss,
} from './shellPalette';

/** The page under the shell, then each shell element with the derived tokens laid over it. */
const surfacesOf = (colors: ShellColors, mode: ShellMode): Record<'cloud' | 'nav' | 'list', Tokens> => {
    const derived = derivePaletteTokens(colors, mode);
    const page = { ...(mode === 'dark' ? darkPage : lightPage), ...derived.root };
    return {
        cloud: { ...page, ...derived.cloud },
        nav: { ...page, ...derived.nav },
        list: { ...page, ...derived.sidebar },
    };
};

/** Deterministic colours, so a failing sweep names the same inputs on every run. */
const randomColors = (count: number): ShellColors[] => {
    let seed = 0x5eed;
    const next = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed;
    };
    const hex = () => `#${(next() & 0xffffff).toString(16).padStart(6, '0')}`;
    return Array.from({ length: count }, () => ({ cloudRail: hex(), navRail: hex(), list: hex() }));
};

const cases: [string, ShellColors][] = [
    ...Object.entries(PRESET_COLORS),
    ['saturated blue', { cloudRail: '#3B82F6', navRail: '#3B82F6', list: '#3B82F6' }],
    ['pure white', { cloudRail: '#FFFFFF', navRail: '#FFFFFF', list: '#FFFFFF' }],
    ['pure black', { cloudRail: '#000000', navRail: '#000000', list: '#000000' }],
    ['mid gray', { cloudRail: '#777777', navRail: '#888888', list: '#999999' }],
    ...randomColors(120).map((colors, i): [string, ShellColors] => [`random ${i} ${colors.list}`, colors]),
];

describe.each(['light', 'dark'] as const)('derivePaletteTokens (%s)', mode => {
    describe.each(cases)('%s', (_name, colors) => {
        const surfaces = surfacesOf(colors, mode);

        it.each([
            // Rail text, the inactive cloud tile, the open destination's label, the focus ring.
            ['cloud', 'rail-foreground', 'rail', 4.5],
            ['cloud', 'rail-foreground', 'background', 4.5],
            ['cloud', 'focus-ring', 'rail', 3],
            ['nav', 'rail-foreground', 'rail-elevated', 4.5],
            ['nav', 'foreground', 'rail-elevated', 4.5],
            ['nav', 'rail-foreground', 'accent', 4.5],
            ['nav', 'focus-ring', 'rail-elevated', 3],
            // The list: titles, secondary lines, the hover, the search field.
            ['list', 'sidebar-foreground', 'sidebar', 4.5],
            ['list', 'muted-foreground', 'sidebar', 4.5],
            ['list', 'muted-foreground', 'accent', 4.5],
            ['list', 'muted-foreground', 'well', 4.5],
            ['list', 'placeholder', 'well', 4.5],
        ] as const)('%s: --%s on --%s clears %s:1', (surface, fg, bg, minimum) => {
            expect(ratio(surfaces[surface], fg, bg)).toBeGreaterThanOrEqual(minimum);
        });

        if (mode === 'light') {
            it('nav: the open tile carries its icon and stands off a coloured rail', () => {
                const nav = surfaces.nav;
                expect(ratio(nav, 'rail-active-foreground', 'rail-active')).toBeGreaterThanOrEqual(3);
                const rail = nav['rail-elevated'] ?? '';
                if (parseFloat(rail.split(/\s+/)[1] ?? '0') >= 20) {
                    expect(ratio(nav, 'rail-active', 'rail-elevated')).toBeGreaterThanOrEqual(OPEN_TILE_RATIO);
                }
            });
        }

        it.each(['accent', 'well'] as const)('list: --%s stands a step off --sidebar', token => {
            expect(ratio(surfaces.list, 'sidebar', token)).toBeGreaterThanOrEqual(1.08);
        });

        it('keeps the light list a light ground in light mode and a dark one in dark mode', () => {
            const ground = luminance(surfaces.list['sidebar'] ?? '');
            if (mode === 'light') expect(ground).toBeGreaterThan(0.6);
            else expect(ground).toBeLessThan(0.05);
        });
    });
});

describe('derivePaletteTokens on a dark rail in light mode', () => {
    const { root, cloud } = derivePaletteTokens(PRESET_COLORS.midnight, 'light');

    it('turns the rail text white and keeps the cloud and place tiles readable', () => {
        expect(cloud['rail-foreground']).toBe('0 0% 100%');
        expect(contrast('0 0% 100%', cloud['background'] ?? '')).toBeGreaterThanOrEqual(4.5);
        expect(contrast(cloud['focus-ring'] ?? '', root['rail'] ?? '')).toBeGreaterThanOrEqual(3);
    });
});

describe('derivePaletteTokens on a lime nav rail', () => {
    it('turns the open tile near-black with a white icon, where lime on lime would not show', () => {
        const { nav } = derivePaletteTokens(PRESET_COLORS.lemon, 'light');
        expect(nav['rail-active-foreground']).toBe('0 0% 100%');
        expect(luminance(nav['rail-active'] ?? '')).toBeLessThan(0.05);
    });

    it('keeps the full lime tile on a gray nav rail', () => {
        const { nav } = derivePaletteTokens(PRESET_COLORS.mist, 'light');
        expect(nav['rail-active']).toBe('76 87% 49%');
    });
});

describe('shellPaletteCss', () => {
    it('writes light rules under :root:not(.dark) and dark rules under :root.dark, scoped per shell element', () => {
        const text = shellPaletteCss(PRESET_COLORS.forest, '', { dark: true });
        expect(text).toContain(':root:not(.dark) {');
        expect(text).toContain(":root:not(.dark) [data-shell-rail='cloud'] {");
        expect(text).toContain(":root:not(.dark) [data-shell-rail='nav'] {");
        expect(text).toContain(':root:not(.dark) [data-shell-sidebar] {');
        expect(text).toContain(':root.dark {');
        expect(text).toContain(':root.dark [data-shell-sidebar] {');
    });

    it('leaves dark mode to the stylesheet when asked to keep the dark shell (Mist)', () => {
        const text = shellPaletteCss(PRESET_COLORS.mist, '', { dark: false });
        expect(text).toContain(':root:not(.dark) {');
        expect(text).not.toContain('.dark {');
        expect(text).not.toContain(':root.dark');
    });

    it('nests under a preview scope, so a card draws its own palette', () => {
        const text = shellPaletteCss(PRESET_COLORS.plum, "[data-palette-preview='plum']", { dark: true });
        expect(text).toContain(":root:not(.dark) [data-palette-preview='plum'] {");
        expect(text).toContain(":root.dark [data-palette-preview='plum'] {");
    });
});

describe('PAGE_TOKENS', () => {
    it.each(Object.entries(PAGE_TOKENS.light))('light --%s matches styles.css', (name, value) => {
        expect(lightPage[name]).toBe(value);
    });

    it.each(Object.entries(PAGE_TOKENS.dark))('dark --%s matches styles.css', (name, value) => {
        expect(darkPage[name]).toBe(value);
    });
});

describe('derivePaletteTokens on custom coloured nav rails', () => {
    it.each(['#FFC000', '#40E0D0', '#00FF00'])(
        'turns the open tile near-black on %s, where lime would not show',
        navRail => {
            const { root, nav } = derivePaletteTokens({ cloudRail: '#12131A', navRail, list: '#F6F7F9' }, 'light');
            expect(nav['rail-active-foreground']).toBe('0 0% 100%');
            expect(contrast(nav['rail-active'] ?? '', root['rail-elevated'] ?? '')).toBeGreaterThanOrEqual(
                OPEN_TILE_RATIO
            );
        }
    );
});
