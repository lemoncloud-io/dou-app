import { runtime } from '@chatic/runtime';
import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-web';
import type { WebHostFacts } from '@chatic/runtime-web';

import { desktopStores } from './stores';

export { createWebConfigPorts } from './configPorts';
export { desktopStores } from './stores';

/**
 * The desktop page's own storage and cache adapters. `@chatic/runtime-web`'s `storage.vault`,
 * `storage.local`, `storage.tab` and `cache.web-storage` keep the same rows in the same places, but each
 * builds store objects of its own, and the runtime's must be the very objects `desktopStores` holds —
 * the ones `src/app/storage` and `@chatic/config` were handed. Bound to that set, the runtime is built
 * exactly as it was before the declaration existed.
 */

/**
 * `storage.desktop` — the session where `resolveStorageStores` put it for this window: the shell's vault
 * for the secrets once it says it keeps one, else `localStorage` in the shell and `sessionStorage` in a
 * browser tab; the runtime's device store in `localStorage`.
 *
 * With a vault, the vault is loaded — and anything left in localStorage moved into it — before the
 * runtime is built, because the runtime reads it synchronously from the start. A desktop shell from
 * before the vault updates itself, and keeps the tokens in localStorage until it has. The load never
 * rejects: it answers every failure with a fallback.
 */
export const storageDesktop = defineAdapter<'storage', WebHostFacts>({
    id: 'storage.desktop',
    port: 'storage',
    create: async () => {
        const { vault, secret, plain, device, webLocal, webSession } = desktopStores;
        if (vault) {
            await runtime.boot.prepareSecretStorage({
                vault,
                plain,
                web: webLocal,
                tab: webSession,
                afterLogout: new URLSearchParams(window.location.search).get('logout') === '1',
            });
        }
        return { secret, plain, device };
    },
});

/**
 * `cache.desktop-web-storage` — IndexedDB, and a plain tab's invited clouds in the window's raw
 * `webSession`: the page's cache routing (`webLocalCachePorts`), as `createWebRuntime` built it. The tab
 * store is the raw one, never the tolerant `tab` the features use, because a cache must hear a failed
 * write.
 */
export const cacheDesktopWebStorage = defineAdapter<'cache', WebHostFacts>({
    id: 'cache.desktop-web-storage',
    port: 'cache',
    create: () => webLocalCachePorts(desktopStores.webSession),
});
