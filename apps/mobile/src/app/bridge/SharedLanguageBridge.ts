import { NativeModules } from 'react-native';

import type { LanguagePreference } from '../stores/languagePreference';

const { SharedLanguage } = NativeModules;

export interface ISharedLanguageBridge {
    /** Copies the choice into storage the push services can read. Never rejects. */
    set(preference: LanguagePreference): Promise<void>;
}

/**
 * Copies the language choice to where the push services look for it — the iOS App Group defaults the
 * Notification Service Extension shares, and the Android SharedPreferences the messaging service
 * reads. Both build banners while the app is not running, so the shell's own store is out of reach.
 *
 * Best effort, and silent when the module is missing — unlike the other bridges, which warn. The copy
 * runs at every launch, so a warning would fire on every boot of any build without the module, and a
 * missing copy only leaves the banners on the device language, which is what they showed before a
 * choice could be made. The next launch writes it again.
 */
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
