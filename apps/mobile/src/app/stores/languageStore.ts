import { create } from 'zustand';

import { SharedLanguageBridge } from '../bridge';
import { registerLanguageChoice } from '../utils/i18n';
import { readLanguagePreference, writeLanguagePreference } from './languageStorage';
import type { LanguagePreference } from './languagePreference';

export interface LanguageState {
    preference: LanguagePreference;
    setPreference: (preference: LanguagePreference) => void;
}

/**
 * The language choice the web app made in Settings — `system` or a pinned `ko`/`en`. The web is the
 * only writer (SavePreference `'language'`); this store persists it and hands it to the three readers
 * that cannot ask the web: the shell's own copy (`t()`), and the two push services that build
 * banners while the app is not running (iOS Notification Service Extension, Android messaging
 * service), which read it from shared storage.
 *
 * Read synchronously like `themeStore`, not through `persist`, because `t()` is synchronous and the
 * first alert or error screen must already be in the chosen language.
 */
export const useLanguageStore = create<LanguageState>()(set => ({
    preference: readLanguagePreference(),
    setPreference: preference => {
        set({ preference });
        writeLanguagePreference(preference);
        void SharedLanguageBridge.set(preference);
    },
}));

registerLanguageChoice(() => useLanguageStore.getState().preference);

// Mirrored once per launch as well as on every change: shared storage is a copy, and an install that
// upgraded with a choice already stored — or whose shared write failed — would otherwise leave the
// push services on the device language until the next change.
void SharedLanguageBridge.set(useLanguageStore.getState().preference);
