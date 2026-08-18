/**
 * Theme value model — pure, with no storage or provider dependency.
 *
 * Kept separate from themeStorage so consumers that only need to validate a value
 * (the SavePreference bridge handler) can import it without pulling in the services
 * provider, and so tests exercise the parser that actually ships.
 */

export type ThemeMode = 'dark' | 'light' | 'system';

/**
 * Light is the default whenever nothing is stored. Deliberately NOT 'system':
 * the OS scheme is interpreted independently by the web layer (matchMedia) and
 * the native layer (useColorScheme), so letting it decide the default means the
 * two can disagree for the frames where only one of them has resolved.
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'light';

const THEME_MODES: readonly string[] = ['dark', 'light', 'system'];

export const isThemeMode = (value: unknown): value is ThemeMode =>
    typeof value === 'string' && THEME_MODES.includes(value);

/**
 * Normalize a raw stored theme into a ThemeMode, or null when unrecognized.
 *
 * Three shapes must be accepted, because this key has had two writers:
 *   1. 'dark'                                        — the plain mode this module's owner writes
 *   2. '{"state":{"theme":"dark"},"version":0}'      — the legacy zustand-persist envelope
 *   3. { state: { theme: 'dark' } }                  — the same envelope already parsed
 *
 * (2) exists because themeStore used to persist through zustand's `persist`
 * middleware under this very key; (3) guards against a storage layer that
 * parses one level for us. Anything else returns null so the caller can fall
 * back to the default rather than leaking a bogus value into the status bar —
 * or, since the value is interpolated into an injected script, worse.
 */
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
