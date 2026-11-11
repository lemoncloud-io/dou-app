import { TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The stores this site keeps state in. The landing site only ever runs in a browser tab, so there is no
 * environment to choose between, and they are built here once.
 *
 * - `localStore` — this browser's `localStorage`, raw: `@chatic/config`'s local lane.
 * - `deviceStore` — the same storage, tolerant of a full or blocked one: the reader's language.
 * - `tabStore` — this tab's `sessionStorage`, raw: the shared session's two ports, the relay token
 *   among them (`bootSessionRuntime`); config's session lane; and everything the subscription pages
 *   carry across a trip to a provider's page — the sign-in in flight, a pending checkout or card
 *   change, the sandbox choice. Each of those callers already treats a refused write as its own
 *   concern.
 *
 * Nothing else in the site names a web storage; the root lint rule refuses it.
 */
export const localStore: KeyValueStore = WebStore.local();
export const deviceStore: KeyValueStore = new TolerantStore(localStore);
export const tabStore: KeyValueStore = WebStore.session();
