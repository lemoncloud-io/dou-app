import type { PreferenceKey } from '@chatic/bridge-messages';
import { provider } from '../services';
import { DEFAULT_LANGUAGE_PREFERENCE, isLanguagePreference } from './languagePreference';
import type { LanguagePreference } from './languagePreference';

const LANGUAGE_KEY: PreferenceKey = 'language';
const CONFIG_KEY = 'ui.language';

export const writeLanguagePreference = (preference: LanguagePreference): void => {
    provider.preferenceService.setSync(LANGUAGE_KEY, preference);
};

const readWebConfigChoice = (): LanguagePreference | null => {
    const raw = provider.configKvService.getAll()[CONFIG_KEY];
    if (typeof raw !== 'string') return null;
    try {
        const value: unknown = JSON.parse(raw);
        return isLanguagePreference(value) ? value : null;
    } catch {
        return null;
    }
};

export const readLanguagePreference = (): LanguagePreference => {
    const raw: unknown = provider.preferenceService.getSync(LANGUAGE_KEY);

    const fromWeb = readWebConfigChoice();
    if (fromWeb) {
        if (raw !== fromWeb) writeLanguagePreference(fromWeb);
        return fromWeb;
    }

    if (isLanguagePreference(raw)) return raw;
    if (raw !== null && raw !== undefined) writeLanguagePreference(DEFAULT_LANGUAGE_PREFERENCE);
    return DEFAULT_LANGUAGE_PREFERENCE;
};
