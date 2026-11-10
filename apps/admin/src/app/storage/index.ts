import { TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The stores this console keeps state in. admin only ever runs in a browser tab — never inside a native
 * or desktop shell — so there is no environment to choose between, and they are built here once.
 *
 * - `localStore` — this browser's `localStorage`, raw: `@chatic/config`'s local lane, which must hear a
 *   write a full storage refused. Where site data is blocked outright, the store is page memory instead,
 *   and the console still boots.
 * - `deviceStore` — the same storage, tolerant of a full or blocked one: the console language.
 * - `tabStore` — this tab's `sessionStorage`: the session, both of its ports, and config's session lane.
 *
 * Nothing else in the app names a web storage; the root lint rule refuses it.
 */
export const localStore: KeyValueStore = WebStore.local();
export const deviceStore: KeyValueStore = new TolerantStore(localStore);
export const tabStore: KeyValueStore = WebStore.session();
