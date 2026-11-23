import { readStorageEnvironment, resolveStorageStores } from '@chatic/runtime-web';
import type { StorageStores } from '@chatic/runtime-web';

export const desktopStores: StorageStores = resolveStorageStores({
    ...readStorageEnvironment(),
    lateVaultConfirmed: false,
});
