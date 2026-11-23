import { runtime } from '@chatic/runtime';
import type { KeyValueStore } from '@chatic/storage';

export const syncThemeFromSharedKey = (local: KeyValueStore): void => {
    try {
        const shared = local.get('vite-ui-theme');
        const { storageKeyFor, encodeValue } = runtime.settings;
        if (shared !== null) local.set(storageKeyFor('ui.theme'), encodeValue(shared));
    } catch {
        // Best-effort — the resolver still has window.CHATIC_APP_THEME / defaultValue below it.
    }
};
