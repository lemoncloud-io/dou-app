import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-web';
import type { WebHostFacts } from '@chatic/runtime-web';

import { deviceStore, tabStore } from '../../app/storage';

/**
 * The console's own storage and cache adapters. `@chatic/runtime-web`'s `storage.tab` and
 * `cache.web-storage` keep the same rows in the same web storages, but each builds store objects of its
 * own, and admin's must be the very objects `src/app/storage` hands out. Where site data is blocked,
 * those stores are page memory: one `tabStore` then holds the session, config's session lane and the
 * cache's tab rows together, and a second memory store would hide one from the others. Bound to the
 * console's stores, the runtime is built exactly as it was before the declaration existed.
 */

/**
 * `storage.admin-tab` — the session in this tab's `sessionStorage`, both of its ports, and the
 * runtime's device store in `localStorage` (tolerant). admin only ever runs in a browser tab, so the
 * session ends with the tab like the sign-in does.
 */
export const storageAdminTab = defineAdapter<'storage', WebHostFacts>({
    id: 'storage.admin-tab',
    port: 'storage',
    create: () => ({ secret: tabStore, plain: tabStore, device: deviceStore }),
});

/**
 * `cache.admin-web-storage` — IndexedDB, and a plain tab's invited clouds in the console's `tabStore`:
 * the page's cache routing (`webLocalCachePorts`), as `createWebRuntime` built it. The tab store is the
 * raw one, never the tolerant `deviceStore`, because a cache must hear a failed write.
 */
export const cacheAdminWebStorage = defineAdapter<'cache', WebHostFacts>({
    id: 'cache.admin-web-storage',
    port: 'cache',
    create: () => webLocalCachePorts(tabStore),
});
