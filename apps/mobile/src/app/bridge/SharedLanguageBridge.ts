import { NativeModules } from 'react-native';

import type { LanguagePreference } from '../stores/languagePreference';

const { SharedLanguage } = NativeModules;

export interface ISharedLanguageBridge {
    set(preference: LanguagePreference): Promise<void>;
}

export const SharedLanguageBridge: ISharedLanguageBridge = {
    set: async (preference: LanguagePreference): Promise<void> => {
        if (!SharedLanguage?.set) return;
        try {
            await SharedLanguage.set(preference);
        } catch {
            // See above — the next launch re-copies it.
        }
    },
};
