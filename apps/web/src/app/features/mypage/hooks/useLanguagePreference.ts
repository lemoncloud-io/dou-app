import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';

import { syncLanguageChoiceToShell } from '../../../bridge';
import {
    type LanguagePreference,
    deviceLanguageCandidates,
    resolveLanguage,
    toLanguagePreference,
} from '../../../../i18n/languagePreference';

export const useLanguagePreference = () => {
    const { i18n } = useTranslation();
    const preference = toLanguagePreference(runtime.settings.useConfigValue<string>('ui.language'));

    const setPreference = (next: LanguagePreference) => {
        runtime.settings.set('ui.language', next, { lane: 'shell' });
        void syncLanguageChoiceToShell(next);
        void i18n.changeLanguage(resolveLanguage(next, deviceLanguageCandidates()));
    };

    return { preference, setPreference };
};
