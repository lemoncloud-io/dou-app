import { TolerantMedium, WebMedium } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The media this console keeps state in. admin only ever runs in a browser tab — never inside a native
 * or desktop shell — so there is no environment to choose between, and they are built here once.
 *
 * - `localMedium` — this browser's `localStorage`, raw: `@chatic/config`'s local lane, which must hear a
 *   write a full storage refused. Where site data is blocked outright, the medium is page memory instead,
 *   and the console still boots.
 * - `deviceMedium` — the same storage, tolerant of a full or blocked one: the console language.
 * - `tabMedium` — this tab's `sessionStorage`: the session, both of its ports, and config's session lane.
 *
 * Nothing else in the app names a web storage; the root lint rule refuses it.
 */
export const localMedium: KeyValueStore = WebMedium.local();
export const deviceMedium: KeyValueStore = new TolerantMedium(localMedium);
export const tabMedium: KeyValueStore = WebMedium.session();
