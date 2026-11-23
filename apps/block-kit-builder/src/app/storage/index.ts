import { createJSONStorage } from 'zustand/middleware';

import { asDomStorage, TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

export const deviceStore: KeyValueStore = new TolerantStore(WebStore.local());

export const persistStorageOver = (store: KeyValueStore) => createJSONStorage(() => asDomStorage(store));
