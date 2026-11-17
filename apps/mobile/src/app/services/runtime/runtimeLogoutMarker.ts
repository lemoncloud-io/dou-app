import { keyValueStoreOn, setSecretLogoutPending } from '@chatic/runtime-mobile';

import { openRuntimeStorageFiles } from './runtimeStorageFiles';

/**
 * Records in the runtime's own plain file whether a page's vault clear was confirmed, where the runtime's
 * boot looks for an unfinished logout. The page keeps its own marker in storage the runtime cannot read,
 * and the runtime may own the next launch: without this, a clear the keychain refused would leave tokens
 * the runtime boots on, signing the person back in.
 *
 * Its own module so that the vault bridge, which is on the app's startup path, loads it (and the runtime
 * library with it) only when a page actually clears the vault.
 */
export const recordPageVaultClear = (ok: boolean): void => {
    setSecretLogoutPending(keyValueStoreOn(openRuntimeStorageFiles().plain), !ok);
};
