import { useEffect } from 'react';
import { isNative } from '@chatic/bridges';

import { appBridge } from '../bridge';
import { PREFERENCES } from '../stores/preferenceKeys';
import { hasLocalPreference, usePreferenceStore } from '../stores/usePreferenceStore';

// Keys managed by usePreferenceStore — only these are bridge-read on startup.
// Language is handled by its own provider (i18n).
const MANAGED_KEYS = ['blurLastMessage', 'isFirstRun', 'theme'] as const;

/**
 * Bridge fallback read: fills the store from native storage for any managed key
 * that is not already in the local cache.
 *
 * Runs only on native, and only for cache misses — a value already in
 * localStorage wins and never triggers a bridge round-trip. When the bridge has
 * no value either, the store keeps its synchronous default.
 *
 * For `theme` this is only a FALLBACK. The shell injects the persisted theme as
 * `window.CHATIC_APP_THEME` before content loads and readInitialTheme() seeds the
 * cache from it, so the bridge read here is skipped except on older shells that
 * predate the injection. It has to be a fallback: this component is mounted inside
 * AppRuntime, which gates its subtree on session readiness, so its values arrive
 * well after the first paint.
 *
 * Renders nothing; mounted once under AppRuntime.
 */
export const PreferenceLoader = (): null => {
    const hydrate = usePreferenceStore(state => state.hydrate);

    useEffect(() => {
        if (!isNative()) return;
        MANAGED_KEYS.forEach(name => {
            if (hasLocalPreference(name)) return; // local cache wins — skip the bridge read
            appBridge.fetchPreference({ key: PREFERENCES[name].nativeKey }).then(preference => {
                // Only hydrate when the bridge actually holds a value; otherwise keep the default.
                if (preference.data.value != null) hydrate(preference.data.key, preference.data.value);
            });
        });
    }, []);

    return null;
};
