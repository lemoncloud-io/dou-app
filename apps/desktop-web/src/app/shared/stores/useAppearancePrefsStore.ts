import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { isShellColors, PRESET_COLORS, shellPaletteCss, type ShellColors } from '../theme/shellPalette';
import { deviceStore, persistStorageOver } from '../../storage';

export type FontSize = 'small' | 'default' | 'large';
export type MessageDensity = 'compact' | 'comfy' | 'spacious';

export const FONT_SIZES: readonly FontSize[] = ['small', 'default', 'large'];
export const MESSAGE_DENSITIES: readonly MessageDensity[] = ['compact', 'comfy', 'spacious'];

export const PALETTES = ['mist', 'midnight', 'forest', 'ocean', 'plum', 'lemon'] as const;
export type Palette = (typeof PALETTES)[number];
export type PaletteChoice = Palette | 'custom';
export const PALETTE_CHOICES: readonly PaletteChoice[] = [...PALETTES, 'custom'];

const isPalette = (value: unknown): value is Palette => PALETTES.includes(value as Palette);

const ROOT_FONT_PX: Record<Exclude<FontSize, 'default'>, number> = { small: 14, large: 17 };

const DENSITY_VARS: Record<MessageDensity, { rowPy: string; gap: string }> = {
    compact: { rowPy: '0.125rem', gap: '0rem' },
    comfy: { rowPy: '0.375rem', gap: '0.125rem' },
    spacious: { rowPy: '0.625rem', gap: '0.25rem' },
};

interface AppearancePrefsState {
    fontSize: FontSize;
    density: MessageDensity;
    palette: PaletteChoice;
    customPalette: ShellColors | null;
    setFontSize: (fontSize: FontSize) => void;
    setDensity: (density: MessageDensity) => void;
    setPalette: (palette: PaletteChoice) => void;
    setCustomPalette: (colors: ShellColors) => void;
}

type AppearancePrefs = Pick<AppearancePrefsState, 'fontSize' | 'density' | 'palette' | 'customPalette'>;

export const colorsOf = ({
    palette,
    customPalette,
}: Pick<AppearancePrefs, 'palette' | 'customPalette'>): ShellColors =>
    palette === 'custom' ? (customPalette ?? PRESET_COLORS.mist) : PRESET_COLORS[palette];

const SHELL_STYLE_ID = 'shell-palette';

const applyShellPalette = (prefs: Pick<AppearancePrefs, 'palette' | 'customPalette'>): void => {
    let style = document.getElementById(SHELL_STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = SHELL_STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent = shellPaletteCss(colorsOf(prefs), '', { dark: prefs.palette !== 'mist' });
};

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
            storage: persistStorageOver(deviceStore),
            version: 1,
            migrate: persisted => persisted as AppearancePrefs,
            partialize: ({ fontSize, density, palette, customPalette }) => ({
                fontSize,
                density,
                palette,
                customPalette,
            }),
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
