import { useTranslation } from 'react-i18next';

import { isNative } from '@chatic/bridges';
import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

import { appBridge } from '../../../bridge';
import {
    type LanguagePreference,
    deviceLanguageCandidates,
    resolveLanguage,
    toLanguagePreference,
} from '../../../../i18n/languagePreference';

/**
 * Tells the native shell's own language store what was chosen, with confirmation and one retry —
 * the same second channel `setTheme` keeps for the theme.
 *
 * `config.set(..., { lane: 'shell' })` below lands in the shell's meaning-blind config store, which is
 * only read back into this web app on the next boot. The shell's own surfaces — its alert copy, the
 * push banners its notification services build — would read a store of their own, `languageStore`
 * (`usePreferenceCacheHandler`'s `'language'` case), which nothing else ever updates. The value sent
 * is the choice itself, `system` included, so the shell can tell "follow the device" from a pin.
 */
const syncLanguageToNativeStore = async (preference: LanguagePreference): Promise<void> => {
    if (!isNative()) return;
    const attempt = () => appBridge.savePreferenceConfirmed({ key: 'language', value: preference });
    try {
        await attempt();
    } catch {
        try {
            await attempt();
        } catch {
            /* give up — the next change re-syncs, and the config store above already has it */
        }
    }
};

/**
 * The language choice in Settings — `system` (the default) or a language pinned by hand.
 *
 * Three writes, and each has a reader: `ui.language` on the shell lane is what the next boot resolves
 * from (mirrored locally for a shell-less browser), the native store is what the shell's own surfaces
 * would follow, and `changeLanguage` is what the screen shows now. Choosing `system` switches straight
 * to the device language, so the sheet never shows one language while claiming another.
 */
export const useLanguagePreference = () => {
    const { i18n } = useTranslation();
    const preference = toLanguagePreference(useConfigValue<string>('ui.language'));

    const setPreference = (next: LanguagePreference) => {
        config.set('ui.language', next, { lane: 'shell' });
        void syncLanguageToNativeStore(next);
        void i18n.changeLanguage(resolveLanguage(next, deviceLanguageCandidates()));
    };

    return { preference, setPreference };
};
