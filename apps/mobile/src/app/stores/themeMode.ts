export type ThemeMode = 'dark' | 'light' | 'system';

export const DEFAULT_THEME_MODE: ThemeMode = 'light';

const THEME_MODES: readonly string[] = ['dark', 'light', 'system'];

export const isThemeMode = (value: unknown): value is ThemeMode =>
    typeof value === 'string' && THEME_MODES.includes(value);

export const parseThemeMode = (raw: unknown): ThemeMode | null => {
    if (isThemeMode(raw)) return raw;

    if (typeof raw === 'string') {
        try {
            return parseThemeMode(JSON.parse(raw));
        } catch {
            return null;
        }
    }

    if (raw && typeof raw === 'object') {
        const inner = (raw as { state?: { theme?: unknown } }).state?.theme;
        return isThemeMode(inner) ? inner : null;
    }

    return null;
};
