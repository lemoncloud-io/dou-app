import { create } from 'zustand';

import { SharedLanguageBridge } from '../bridge';
import { registerLanguageChoice } from '../utils/i18n';
import { readLanguagePreference, writeLanguagePreference } from './languageStorage';
import type { LanguagePreference } from './languagePreference';

export interface LanguageState {
    preference: LanguagePreference;
    setPreference: (preference: LanguagePreference) => void;
}

export const useLanguageStore = create<LanguageState>()(set => ({
    preference: readLanguagePreference(),
    setPreference: preference => {
        set({ preference });
        writeLanguagePreference(preference);
        void SharedLanguageBridge.set(preference);
    },
}));

registerLanguageChoice(() => useLanguageStore.getState().preference);

void SharedLanguageBridge.set(useLanguageStore.getState().preference);
