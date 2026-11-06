import { AppStorage } from './appStorage';

import type { IAppStorage, StorageAdapter } from './types';

/** The one app-wide storage. */
export const storage: IAppStorage = new AppStorage();

/** The entry point's call, kept under its established name: `storage.use(adapter)`. */
export const setStorageAdapter = (adapter: StorageAdapter): void => storage.use(adapter);
