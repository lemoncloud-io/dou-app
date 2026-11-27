import { hostProfile, shellKeepsStorageMedium } from '@chatic/bridges';
import { WebStore } from '@chatic/storage';
import type { NativeSecureStore } from '@chatic/storage';
import {
    localStorageStores,
    pageStorageAreas,
    tabStorageStores,
    vaultStorageStores,
    type StorageStores,
} from '@chatic/runtime-web';

import { chooseCandidate, logHybridChoice, type Candidate } from '../candidates';
import { createShellVault } from './shellVault';

export type { StorageStores } from '@chatic/runtime-web';

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

export type StorageMedium = 'vault' | 'webLocal' | 'webSession';

export type StorageCandidate = Candidate<StorageEnvironment> & { readonly id: StorageMedium };

const webSessionLast: StorageCandidate = { id: 'webSession', because: 'a browser tab keeps it with the tab' };

export const STORAGE_CANDIDATES: {
    readonly secret: readonly StorageCandidate[];
    readonly plain: readonly StorageCandidate[];
} = {
    secret: [
        {
            id: 'vault',
            supports: env => env.shellKeepsVault || env.lateVaultConfirmed,
            because: 'the shell keeps a vault, said at launch or confirmed late',
            refused: 'the shell keeps no vault',
        },
        {
            id: 'webLocal',
            supports: env => env.inShell,
            because: 'a shell keeps it across relaunches',
            refused: 'no shell',
        },
        webSessionLast,
    ],
    plain: [
        {
            id: 'webLocal',
            supports: env => env.inShell,
            because: 'a shell keeps it across relaunches',
            refused: 'no shell',
        },
        webSessionLast,
    ],
};

export const resolveStorageStores = (
    env: StorageEnvironment = readStorageEnvironment(),
    vaultFactory: () => NativeSecureStore = createShellVault
): StorageStores => {
    const secret = chooseCandidate(STORAGE_CANDIDATES.secret, env);
    const plain = chooseCandidate(STORAGE_CANDIDATES.plain, env);
    logHybridChoice('storage.secret', secret.chosen.id, secret.reason, { environment: env });
    logHybridChoice('storage.plain', plain.chosen.id, plain.reason);

    const areas = pageStorageAreas();
    switch (secret.chosen.id) {
        case 'vault':
            return vaultStorageStores({
                ...areas,
                vault: vaultFactory(),
                plain: plain.chosen.id === 'webLocal' ? areas.webLocal : areas.webSession,
            });
        case 'webLocal':
            return localStorageStores(areas);
        default:
            return tabStorageStores(areas);
    }
};
