import { encodeValue, storageKeyFor } from '@chatic/config';

import type { KeyValueStore } from '@chatic/storage';

/**
 * `vite-ui-theme` is not private to this app — five apps' `index.html` pre-paint scripts and
 * `@chatic/theme`'s `ThemeProvider` (admin-v2/desktop-web/landing) all read and write this exact
 * key directly, deliberately ("a shared machine keeps one preference" — see
 * `apps/block-kit-builder/index.html`). It stays the durable source and `ui.theme`'s own namespaced
 * storage is kept as a mirror of it, re-synced on every boot so a theme change made in one of those
 * other apps on the same browser shows up here too. The write-back half of the mirror lives in
 * `useTheme.ts`'s `setTheme`.
 *
 * `local` is the app's `webLocal` medium — the same `localStorage` config's own `local` port reads.
 *
 * Must run before `config.init()` — the value it writes is read into the `local` lane by
 * `hydrateStorage()`, which only runs once, inside `init()`.
 */
export const syncThemeFromSharedKey = (local: KeyValueStore): void => {
    try {
        const shared = local.get('vite-ui-theme');
        if (shared !== null) local.set(storageKeyFor('ui.theme'), encodeValue(shared));
    } catch {
        // Best-effort — the resolver still has window.CHATIC_APP_THEME / defaultValue below it.
    }
};
