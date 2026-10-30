import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FontSize = 'small' | 'default' | 'large';
export type MessageDensity = 'compact' | 'comfy' | 'spacious';

export const FONT_SIZES: readonly FontSize[] = ['small', 'default', 'large'];
export const MESSAGE_DENSITIES: readonly MessageDensity[] = ['compact', 'comfy', 'spacious'];

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
    setFontSize: (fontSize: FontSize) => void;
    setDensity: (density: MessageDensity) => void;
}

type AppearancePrefs = Pick<AppearancePrefsState, 'fontSize' | 'density'>;

/** Writes the preferences onto the document root: app-wide font size, and the message row variables. */
export const applyAppearance = ({ fontSize, density }: AppearancePrefs): void => {
    const root = document.documentElement;
    if (fontSize === 'default') root.style.removeProperty('font-size');
    else root.style.fontSize = `${ROOT_FONT_PX[fontSize]}px`;
    const vars = DENSITY_VARS[density] ?? DENSITY_VARS.comfy;
    root.style.setProperty('--message-row-py', vars.rowPy);
    root.style.setProperty('--message-gap', vars.gap);
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
            setFontSize: fontSize => set({ fontSize }),
            setDensity: density => set({ density }),
        }),
        { name: 'chatic-appearance-prefs', partialize: ({ fontSize, density }) => ({ fontSize, density }) }
    )
);

useAppearancePrefsStore.subscribe(applyAppearance);
