import { useEffect } from 'react';
import { isNative } from '@chatic/bridges';
import type { PreferenceKey } from '@chatic/app-messages';

import { appBridge, useOnFetchPreference } from '../bridge';
import { usePreferenceStore } from '../stores/usePreferenceStore';

// Keys managed by usePreferenceStore — only these are fetched on startup.
// Theme and language are handled by their own providers (ThemeProvider, i18n).
const MANAGED_KEYS: PreferenceKey[] = ['blurLastMessage', 'isFirstRun'];

/**
 * Fetches native preference values on mount and hydrates the preference store.
 *
 * Runs only on native: on web the store reads from localStorage synchronously
 * at init and no further loading step is needed.
 *
 * Renders nothing; mounted once under AppRuntime beside NativeHandshake.
 */
export const PreferenceLoader = (): null => {
    const hydrate = usePreferenceStore(state => state.hydrate);

    // Subscribe before the fetch requests go out so no response is missed.
    useOnFetchPreference(message => {
        hydrate(message.data.key, message.data.value);
    });

    useEffect(() => {
        if (!isNative()) return;
        MANAGED_KEYS.forEach(key => appBridge.fetchPreference({ key }));
    }, []);

    return null;
};
