import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-web';
import type { WebHostFacts } from '@chatic/runtime-web';

import { deviceStore, tabStore } from '../../app/storage';

/**
 * The site's own storage and cache adapters. `@chatic/runtime-web`'s `storage.tab` and
 * `cache.web-storage` keep the same rows in the same web storages, but each builds store objects of its
 * own, and the site's must be the very objects `src/app/storage` hands out. Where site data is blocked,
 * those stores are page memory: one `tabStore` then holds the session, config's session lane, the
 * cache's tab rows and everything the subscription pages carry across a provider's page, and a second
 * memory store would hide one from the others. Bound to the site's stores, the runtime is built exactly
 * as it was before the declaration existed.
 */

/**
 * `storage.landing-tab` — the session in this tab's `sessionStorage`, both of its ports, and the
 * runtime's device store in `localStorage` (tolerant). The site only ever runs in a browser tab, so the
 * session ends with the tab like every other per-tab state here.
 */
export const storageLandingTab = defineAdapter<'storage', WebHostFacts>({
    id: 'storage.landing-tab',
    port: 'storage',
    create: () => ({ secret: tabStore, plain: tabStore, device: deviceStore }),
});

/**
 * `cache.landing-web-storage` — IndexedDB, and a plain tab's invited clouds in the site's `tabStore`:
 * the page's cache routing (`webLocalCachePorts`), as `createWebRuntime` built it. The tab store is the
 * raw one, never the tolerant `deviceStore`, because a cache must hear a failed write.
 */
export const cacheLandingWebStorage = defineAdapter<'cache', WebHostFacts>({
    id: 'cache.landing-web-storage',
    port: 'cache',
    create: () => webLocalCachePorts(tabStore),
});
