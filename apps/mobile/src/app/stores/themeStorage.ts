import type { PreferenceKey } from '@chatic/bridge-messages';
import { provider } from '../services';
import { DEFAULT_THEME_MODE, isThemeMode, parseThemeMode } from './themeMode';
import type { ThemeMode } from './themeMode';

const THEME_KEY: PreferenceKey = 'theme';

export const writeThemeMode = (mode: ThemeMode): void => {
    provider.preferenceService.setSync(THEME_KEY, mode);
};

export const readThemeMode = (): ThemeMode => {
    const raw: unknown = provider.preferenceService.getSync(THEME_KEY);
    const parsed = parseThemeMode(raw);
    if (!parsed) return DEFAULT_THEME_MODE;

    const mode = !isThemeMode(raw) && parsed === 'system' ? DEFAULT_THEME_MODE : parsed;

    if (raw !== mode) writeThemeMode(mode);

    return mode;
};
