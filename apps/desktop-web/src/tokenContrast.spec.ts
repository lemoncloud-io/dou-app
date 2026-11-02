import { describe, expect, it } from 'vitest';

import { contrast } from './app/shared/theme/shellPalette';
import { avatarStyle } from './app/shared/utils/avatarColor';
import { darkPage as dark, lightPage as light, ratio, resolve, tokensOf } from './testing/cssTokens';

/**
 * The contrast contract of the theme tokens, measured from styles.css itself.
 *
 * The file states its ratios in comments, and twice a token drifted under AA while
 * its comment still claimed the old figure. These pairs are the ones the app draws
 * text or a focus indicator with; a value that breaks one fails here, not in review.
 * The shell palettes are measured in shellPalette.spec.ts, on the rule that makes them.
 */
/**
 * [foreground, background, minimum]: 4.5 for text, 3 for a focus indicator and for the
 * boundary or state of an interactive control (WCAG 1.4.11).
 */
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
    // Control boundaries: a text field (kit Input reads --input-border), an unselected
    // option, the composer box. Settings controls sit on cards, dialogs on the popover.
    ['control-border', 'background', 3],
    ['control-border', 'card', 3],
    ['control-border', 'popover', 3],
    ['input-border', 'surface', 3],
    // Switch off: the background-coloured thumb on the control-border track.
    ['background', 'control-border', 3],
    // Switch on: the ink edge against the card it sits on, and the ink thumb on the fill.
    ['primary-ink', 'card', 3],
    ['primary-foreground', 'primary', 3],
];

describe.each([
    ['light', light],
    ['dark', dark],
])('%s theme tokens', (_, tokens) => {
    it.each(PAIRS)('--%s on --%s clears %s:1', (fg, bg, minimum) => {
        expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(minimum);
    });
});

// Mist keeps the dark shell in dark mode, so its sample card has to show that shell too.
it('draws the Mist sample card in dark mode with the dark shell', () => {
    const card = tokensOf(".dark [data-palette-preview='mist']");
    for (const name of ['rail', 'rail-elevated', 'sidebar']) expect(card[name]).toBe(dark[name]);
});

/**
 * Avatar initials sit on a fill whose hue is derived per user, so no single pair covers
 * them: every hue has to clear 4.5:1 against --avatar-fg. The fill formula is read from
 * avatarStyle itself, so a change to its saturation is measured here too.
 */
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
