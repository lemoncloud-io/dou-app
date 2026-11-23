import { TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

export const localStore: KeyValueStore = WebStore.local();
export const deviceStore: KeyValueStore = new TolerantStore(localStore);
export const tabStore: KeyValueStore = WebStore.session();
