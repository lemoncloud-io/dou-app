import { useTranslation } from 'react-i18next';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

import {
    type LanguagePreference,
    deviceLanguageCandidates,
    resolveLanguage,
    toLanguagePreference,
} from '../../../../i18n/languagePreference';

/**
 * The language choice in Settings — `system` (the default) or a language pinned by hand.
 *
 * Writing both halves here is the point: `ui.language` is what the next boot resolves from, and
 * `changeLanguage` is what the screen shows now. Choosing `system` switches straight to the device
 * language, so the sheet never shows one language while claiming another.
 */
export const useLanguagePreference = () => {
    const { i18n } = useTranslation();
    const preference = toLanguagePreference(useConfigValue<string>('ui.language'));

    const setPreference = (next: LanguagePreference) => {
        config.set('ui.language', next, { lane: 'local' });
        void i18n.changeLanguage(resolveLanguage(next, deviceLanguageCandidates()));
    };

    return { preference, setPreference };
};
