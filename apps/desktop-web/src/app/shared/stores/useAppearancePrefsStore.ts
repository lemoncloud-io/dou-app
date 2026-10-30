import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { isShellColors, PRESET_COLORS, shellPaletteCss, type ShellColors } from '../theme/shellPalette';

export type FontSize = 'small' | 'default' | 'large';
export type MessageDensity = 'compact' | 'comfy' | 'spacious';

export const FONT_SIZES: readonly FontSize[] = ['small', 'default', 'large'];
export const MESSAGE_DENSITIES: readonly MessageDensity[] = ['compact', 'comfy', 'spacious'];

/** Shell colour presets, in picker order. `mist` is the default and the look of `:root` in `styles.css`. */
export const PALETTES = ['mist', 'midnight', 'forest', 'ocean', 'plum', 'lemon'] as const;
export type Palette = (typeof PALETTES)[number];
/** A preset, or the user's own three colours (`customPalette`). */
export type PaletteChoice = Palette | 'custom';
/** Every choice, in picker order: the presets, then Custom. */
export const PALETTE_CHOICES: readonly PaletteChoice[] = [...PALETTES, 'custom'];

const isPalette = (value: unknown): value is Palette => PALETTES.includes(value as Palette);

/** Root font-size per choice. `default` is absent on purpose: it clears the override so the browser's own base applies. */
const ROOT_FONT_PX: Record<Exclude<FontSize, 'default'>, number> = { small: 14, large: 17 };

/**
 * Message row padding and the gap between messages of one author block, per density. `comfy` is
 * what the rows were before this setting existed (py-1.5, gap-0.5); `styles.css` carries the same
 * values as the variables' fallbacks so a row reads the same with no preference applied.
 */
const DENSITY_VARS: Record<MessageDensity, { rowPy: string; gap: string }> = {
    compact: { rowPy: '0.125rem', gap: '0rem' },
    comfy: { rowPy: '0.375rem', gap: '0.125rem' },
    spacious: { rowPy: '0.625rem', gap: '0.25rem' },
};

interface AppearancePrefsState {
    fontSize: FontSize;
    density: MessageDensity;
    palette: PaletteChoice;
    /** The user's own colours; kept while a preset is on, so Custom can be picked again. */
    customPalette: ShellColors | null;
    setFontSize: (fontSize: FontSize) => void;
    setDensity: (density: MessageDensity) => void;
    setPalette: (palette: PaletteChoice) => void;
    /** Saves the colours and switches to them. */
    setCustomPalette: (colors: ShellColors) => void;
}

type AppearancePrefs = Pick<AppearancePrefsState, 'fontSize' | 'density' | 'palette' | 'customPalette'>;

/** The three colours a choice stands for. Custom with no colours saved yet reads as Mist. */
export const colorsOf = ({
    palette,
    customPalette,
}: Pick<AppearancePrefs, 'palette' | 'customPalette'>): ShellColors =>
    palette === 'custom' ? (customPalette ?? PRESET_COLORS.mist) : PRESET_COLORS[palette];

const SHELL_STYLE_ID = 'shell-palette';

/**
 * Writes the shell colours as one generated stylesheet. The rail and list tokens hold inside their
 * own elements (`data-shell-rail`, `data-shell-sidebar`), which inline variables on the root cannot
 * reach, so the colours go in as rules. Mist leaves dark mode to the stylesheet's own dark shell.
 */
const applyShellPalette = (prefs: Pick<AppearancePrefs, 'palette' | 'customPalette'>): void => {
    let style = document.getElementById(SHELL_STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = SHELL_STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent = shellPaletteCss(colorsOf(prefs), '', { dark: prefs.palette !== 'mist' });
};

/**
 * Writes the preferences onto the document: app-wide font size, the message row variables,
 * `data-palette` on the root, and the shell colours.
 */
export const applyAppearance = ({ fontSize, density, palette, customPalette }: AppearancePrefs): void => {
    const root = document.documentElement;
    if (fontSize === 'default') root.style.removeProperty('font-size');
    else root.style.fontSize = `${ROOT_FONT_PX[fontSize]}px`;
    const vars = DENSITY_VARS[density] ?? DENSITY_VARS.comfy;
    root.style.setProperty('--message-row-py', vars.rowPy);
    root.style.setProperty('--message-gap', vars.gap);
    root.dataset.palette = palette;
    applyShellPalette({ palette, customPalette });
};

/**
 * Reading preferences, persisted to localStorage. zustand's persist hydrates localStorage
 * synchronously, so `main.tsx` can apply the stored values before the first render and the app
 * never paints at the wrong size first. Every later change is applied by the subscription below.
 */
export const useAppearancePrefsStore = create<AppearancePrefsState>()(
    persist(
        set => ({
            fontSize: 'default',
            density: 'comfy',
            palette: 'mist',
            customPalette: null,
            setFontSize: fontSize => set({ fontSize }),
            setDensity: density => set({ density }),
            setPalette: palette => set({ palette }),
            setCustomPalette: customPalette => set({ palette: 'custom', customPalette }),
        }),
        {
            name: 'chatic-appearance-prefs',
            // 1: `customPalette` and the `custom` choice. Version 0 data has neither and reads as is.
            version: 1,
            migrate: persisted => persisted as AppearancePrefs,
            partialize: ({ fontSize, density, palette, customPalette }) => ({
                fontSize,
                density,
                palette,
                customPalette,
            }),
            // A palette this build does not know (stored by a newer one), malformed custom colours, or
            // Custom with none saved read as Mist, so the shell and the picker agree on one.
            merge: (persisted, current) => {
                const stored = (persisted ?? {}) as Partial<AppearancePrefs>;
                const customPalette = isShellColors(stored.customPalette) ? stored.customPalette : null;
                const palette =
                    isPalette(stored.palette) || (stored.palette === 'custom' && customPalette)
                        ? stored.palette
                        : 'mist';
                return { ...current, ...stored, palette, customPalette };
            },
        }
    )
);

useAppearancePrefsStore.subscribe(applyAppearance);
