import { runtime } from '@chatic/runtime-react';

import type { LanguagePreference } from '../../i18n/languagePreference';

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
