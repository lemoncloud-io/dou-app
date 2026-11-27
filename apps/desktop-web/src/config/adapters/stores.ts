import { readStorageEnvironment, resolveStorageStores } from '@chatic/runtime-hybrid-web';
import type { StorageStores } from '@chatic/runtime-hybrid-web';

export const desktopStores: StorageStores = resolveStorageStores({
    ...readStorageEnvironment(),
    lateVaultConfirmed: false,
});
