import { prepareSecretStorage } from '@chatic/runtime-core';
import type { RuntimeEngine, SecretStorageOutcome } from '@chatic/runtime-core';
import { MemoryStore } from '@chatic/storage';
import type { NativeReadResult } from '@chatic/storage';

import { HOME_SEARCH_KEY } from './auth';
import type { AppStateSource } from './foreground';
import { waitForUnlockedVault } from './storage';
import type { DeviceVault, NativeStoragePorts } from './storage';

export const NATIVE_RUNTIME_ENV_KEYS = [
    'VITE_ENV',
    'VITE_PROJECT',
    'VITE_HOST',
    'VITE_OAUTH_ENDPOINT',
    'VITE_SOCIAL_OAUTH_ENDPOINT',
    'VITE_BACKEND_ENDPOINT',
    'VITE_WS_ENDPOINT',
    'VITE_DOU_ENDPOINT',
] as const;

export const missingNativeRuntimeEnv = (env: (name: string) => string | undefined): string[] =>
    NATIVE_RUNTIME_ENV_KEYS.filter(name => !env(name)?.trim());

export class NativeRuntimeEnvError extends Error {
    readonly code = 'NATIVE_RUNTIME_ENV_MISSING';

    constructor(readonly missing: readonly string[]) {
        super(`the build has no ${missing.join(', ')}; the runtime cannot start`);
    }
}

export class NativeRuntimeNoSessionError extends Error {
    readonly code = 'NATIVE_RUNTIME_NO_SESSION';

    constructor(readonly secretStorage: SecretStorageOutcome) {
        super(`the vault holds no session (${secretStorage}); the page takes this launch`);
    }
}

const NO_SESSION_OUTCOMES: readonly SecretStorageOutcome[] = ['empty', 'logout-finished'];

export interface NativeSessionLoad {
    vault: NativeReadResult;
    secretStorage: SecretStorageOutcome;
}

export interface NativeRuntimeBoot extends NativeSessionLoad {
    engine: RuntimeEngine;
}

export const loadNativeSession = async (
    storage: NativeStoragePorts,
    vault: Pick<DeviceVault, 'get'>,
    appState?: AppStateSource
): Promise<NativeSessionLoad> => {
    const read = await waitForUnlockedVault(vault, appState);

    const secretStorage = await prepareSecretStorage({
        vault: storage.secret,
        plain: storage.plain,
        web: new MemoryStore(),
        tab: new MemoryStore(),
        afterLogout: false,
    });

    if (NO_SESSION_OUTCOMES.includes(secretStorage)) {
        storage.plain.remove(HOME_SEARCH_KEY);
        throw new NativeRuntimeNoSessionError(secretStorage);
    }

    return { vault: read, secretStorage };
};
