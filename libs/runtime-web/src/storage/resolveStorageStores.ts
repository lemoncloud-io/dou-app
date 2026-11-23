import { hostProfile, shellKeepsStorageMedium } from '@chatic/bridges';
import { WebStore } from '@chatic/storage';
import type { NativeSecureStore } from '@chatic/storage';

import {
    createShellVault,
    localStorageStores,
    pageStorageAreas,
    tabStorageStores,
    vaultStorageStores,
} from './storeSets';
import type { StorageStores } from './storeSets';

export type { StorageStores } from './storeSets';

export interface StorageEnvironment {
    inShell: boolean;
    shellKeepsVault: boolean;
    lateVaultConfirmed: boolean;
}

export const LATE_VAULT_MARK = 'chatic-shell-vault-confirmed';

export const readStorageEnvironment = (): StorageEnvironment => ({
    inShell: hostProfile().bridge !== null,
    shellKeepsVault: shellKeepsStorageMedium('nativeSecure'),
    lateVaultConfirmed: WebStore.session().get(LATE_VAULT_MARK) === '1',
});

export const resolveStorageStores = (
    env: StorageEnvironment = readStorageEnvironment(),
    vaultFactory: () => NativeSecureStore = createShellVault
): StorageStores => {
    const areas = pageStorageAreas();
    if (env.shellKeepsVault || env.lateVaultConfirmed) {
        return vaultStorageStores({
            ...areas,
            vault: vaultFactory(),
            plain: env.inShell ? areas.webLocal : areas.webSession,
        });
    }
    return env.inShell ? localStorageStores(areas) : tabStorageStores(areas);
};
