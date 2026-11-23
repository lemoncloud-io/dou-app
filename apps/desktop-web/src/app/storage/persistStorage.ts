import { createJSONStorage } from 'zustand/middleware';

import { asDomStorage } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

export const persistStorageOver = (store: KeyValueStore) => createJSONStorage(() => asDomStorage(store));
