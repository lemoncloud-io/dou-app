import { runtime } from '@chatic/runtime';

import type { LanguagePreference } from '../../i18n/languagePreference';

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
 * still reaches it. Only where the frame keeps a preference store (the host's `appShell` port); a
 * browser has no shell store to tell.
 */
export const syncLanguageChoiceToShell = async (preference: LanguagePreference): Promise<void> => {
    const store = runtime.appShell.preferences;
    if (!store) return;
    const attempt = () => store.save('language', preference);
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
