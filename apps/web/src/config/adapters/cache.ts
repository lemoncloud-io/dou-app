import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-web';
import type { StorageStores, WebHostFacts } from '@chatic/runtime-web';

/**
 * `cache.web-local` — the page's cache routing (`webLocalCachePorts`), as `createWebRuntime` built it:
 * each domain in IndexedDB or, in the phone app, the shell's SQLite for what the installed shell holds,
 * and a plain tab's invited clouds in the tab store.
 *
 * The tab store is the raw `webSession` the entry resolved — never the tolerant `tab` the features use,
 * because a cache must hear a failed write — and it is the same object the session and config's session
 * lane keep their rows in, which `cache.web-storage` / `cache.shell-sqlite` would only be when the
 * storage port came from `@chatic/runtime-web` itself.
 */
export const cacheWebLocal = (stores: Pick<StorageStores, 'webSession'>) =>
    defineAdapter<'cache', WebHostFacts>({
        id: 'cache.web-local',
        port: 'cache',
        create: () => webLocalCachePorts(stores.webSession),
    });
