import { useTranslation } from 'react-i18next';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

import { syncLanguageChoiceToShell } from '../../../bridge';
import {
    type LanguagePreference,
    deviceLanguageCandidates,
    resolveLanguage,
    toLanguagePreference,
} from '../../../../i18n/languagePreference';

/**
 * The language choice in Settings — `system` (the default) or a language pinned by hand.
 *
 * Three writes, and each has a reader: `ui.language` on the shell lane is what the next boot resolves
 * from (mirrored locally for a shell-less browser), the shell's `languageStore` is what its own
 * surfaces and push banners follow (`syncLanguageChoiceToShell`), and `changeLanguage` is what the
 * screen shows now. Choosing `system` switches straight to the device language, so the sheet never
 * shows one language while claiming another.
 */
export const useLanguagePreference = () => {
    const { i18n } = useTranslation();
    const preference = toLanguagePreference(useConfigValue<string>('ui.language'));

    const setPreference = (next: LanguagePreference) => {
        config.set('ui.language', next, { lane: 'shell' });
        void syncLanguageChoiceToShell(next);
        void i18n.changeLanguage(resolveLanguage(next, deviceLanguageCandidates()));
    };

    return { preference, setPreference };
};
