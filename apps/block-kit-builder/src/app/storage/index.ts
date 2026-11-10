import { createJSONStorage } from 'zustand/middleware';

import { asDomStorage, TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The one store the builder keeps state in: this browser's `localStorage`, tolerant of a full or
 * blocked one — a builder that cannot remember the message or the pane widths still draws and edits.
 * The builder only ever runs in a browser tab, so there is no environment to choose between.
 *
 * Nothing else in the app names a web storage; the root lint rule refuses it.
 */
export const deviceStore: KeyValueStore = new TolerantStore(WebStore.local());

/**
 * The storage a zustand `persist` store writes through. `persist` falls back to `localStorage` when
 * given none, which is a direct web storage write — so its `persist` call names the `KeyValueStore`
 * it writes to with this.
 */
export const persistStorageOver = (store: KeyValueStore) => createJSONStorage(() => asDomStorage(store));
