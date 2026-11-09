import { createJSONStorage } from 'zustand/middleware';

import { asDomStorage } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The storage a zustand `persist` store writes through. `persist` falls back to `localStorage` when
 * given none, which is a direct web storage write — so every store names its medium with this.
 */
export const persistStorageOver = (medium: KeyValueStore) => createJSONStorage(() => asDomStorage(medium));
