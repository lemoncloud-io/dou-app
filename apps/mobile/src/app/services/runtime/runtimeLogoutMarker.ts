import { keyValueStoreOn, setSecretLogoutPending } from '@chatic/runtime-mobile';

import { openRuntimeStorageFiles } from './runtimeStorageFiles';

export const recordPageVaultClear = (ok: boolean): void => {
    setSecretLogoutPending(keyValueStoreOn(openRuntimeStorageFiles().plain), !ok);
};
