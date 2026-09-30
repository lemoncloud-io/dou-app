import { isNative } from '@chatic/bridges';

import type { LanguagePreference } from '../../i18n/languagePreference';
import { appBridge } from './appBridge';

/**
 * Tells the native shell's own language store what was chosen, with confirmation and one retry —
 * the same second channel `setTheme` keeps for the theme.
 *
 * `config.set('ui.language', ..., { lane: 'shell' })` lands in the shell's meaning-blind config store,
 * which the web reads back as its boot envelope. The shell's own surfaces — its alert copy, and the
 * push banners its notification services build — follow `languageStore` instead, which only this
 * message updates. The value is the choice itself, `system` included, so the shell can tell "follow
 * the device" from a pin.
 *
 * Sent on every change (the Settings sheet) and once per native boot (`PreferenceLoader`), so a choice
 * made while an older shell was installed — one that kept it in a format the new shell discards —
 * still reaches it.
 */
export const syncLanguageChoiceToShell = async (preference: LanguagePreference): Promise<void> => {
    if (!isNative()) return;
    const attempt = () => appBridge.savePreferenceConfirmed({ key: 'language', value: preference });
    try {
        await attempt();
    } catch {
        try {
            await attempt();
        } catch {
            /* give up — the next change or the next boot sends it again */
        }
    }
};
