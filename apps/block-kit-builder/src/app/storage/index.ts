import { createJSONStorage } from 'zustand/middleware';

import { asDomStorage, TolerantMedium, WebMedium } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The one medium the builder keeps state in: this browser's `localStorage`, tolerant of a full or
 * blocked one — a builder that cannot remember the message or the pane widths still draws and edits.
 * The builder only ever runs in a browser tab, so there is no environment to choose between.
 *
 * Nothing else in the app names a web storage; the root lint rule refuses it.
 */
export const deviceMedium: KeyValueStore = new TolerantMedium(WebMedium.local());

/**
 * The storage a zustand `persist` store writes through. `persist` falls back to `localStorage` when
 * given none, which is a direct web storage write — so the store names its medium with this.
 */
export const persistStorageOver = (medium: KeyValueStore) => createJSONStorage(() => asDomStorage(medium));
