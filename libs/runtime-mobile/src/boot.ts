import { Platform } from 'react-native';

import { config, createWebEnvAdapter } from '@chatic/config';
import { prepareSecretStorage } from '@chatic/runtime-core';
import type { RuntimeEngine, SecretStorageOutcome } from '@chatic/runtime-core';
import { MemoryStore } from '@chatic/storage';
import type { KeyValueStore, NativeReadResult, NativeStore } from '@chatic/storage';

import { HOME_SEARCH_KEY } from './auth';
import { createNativeRuntime } from './createNativeRuntime';
import type { NativeRuntimeOptions } from './createNativeRuntime';
import type { AppStateSource } from './foreground';
import { waitForUnlockedVault } from './storage';
import type { DeviceVault } from './storage';

/**
 * The build values the runtime cannot start without: where the relay, the backend and the sign-in
 * services are, and which project and stage this build is. A page reads the same names from its own
 * build; the app has to carry them in its own environment file to run the session itself.
 */
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

/** The required build values `env` does not answer, empty when it has them all. */
export const missingNativeRuntimeEnv = (env: (name: string) => string | undefined): string[] =>
    NATIVE_RUNTIME_ENV_KEYS.filter(name => !env(name)?.trim());

/** What the app hands the boot: the runtime's options, its built (not yet loaded) stores, and its vault. */
export interface NativeRuntimeBootOptions extends Omit<NativeRuntimeOptions, 'storage'> {
    storage: { secret: NativeStore; plain: KeyValueStore; device: KeyValueStore };
    /** The vault behind `storage.secret`, asked directly while it is locked. */
    vault: Pick<DeviceVault, 'get'>;
    /** The app's build values by name (react-native-config's `Config`), for the runtime's config. */
    env: (name: string) => string | undefined;
    /** The app's state, for the locked-vault wait. React Native's `AppState` when left out. */
    appState?: AppStateSource;
}

/** What a boot reports: the engine, and how the session's secrets were found. */
export interface NativeRuntimeBoot {
    engine: RuntimeEngine;
    /** The vault as the boot first read it. */
    vault: NativeReadResult;
    /** Which row of the secret-storage step the boot took (`vault`, `empty`, `logout-finished`, …). */
    secretStorage: SecretStorageOutcome;
}

/** Thrown when the build lacks values the runtime needs, before anything is started. */
export class NativeRuntimeEnvError extends Error {
    readonly code = 'NATIVE_RUNTIME_ENV_MISSING';

    constructor(readonly missing: readonly string[]) {
        super(`the build has no ${missing.join(', ')}; the runtime cannot start`);
    }
}

/**
 * Thrown when the vault holds no session, after the secret-storage step has run and before anything is
 * created: the page takes this launch instead.
 *
 * The page's boot is the only step that moves a session out of the page's own `localStorage` into the
 * vault, and the runtime never sees that storage. An install updating from an app without a vault has
 * its session there and nothing in the vault, so a runtime that started anyway would sign the device in
 * as a guest over it. Letting the page own the launch moves the session, and the next launch finds it
 * in the vault. On an install that is simply signed out it costs nothing: the page signs a guest in the
 * same way the runtime would have, and the launch after that is the runtime's.
 */
export class NativeRuntimeNoSessionError extends Error {
    readonly code = 'NATIVE_RUNTIME_NO_SESSION';

    constructor(readonly secretStorage: SecretStorageOutcome) {
        super(`the vault holds no session (${secretStorage}); the page takes this launch`);
    }
}

/**
 * The secret-storage outcomes that leave the vault without a session: it answered with no tokens, or a
 * logout whose clear was never confirmed has just emptied it. A vault that could not be read is not
 * among them: the runtime runs from the tab then, as it always has, rather than guess what it holds.
 */
const NO_SESSION_OUTCOMES: readonly SecretStorageOutcome[] = ['empty', 'logout-finished'];

/**
 * Boots the runtime in React Native's process, in the order a page's entry boots it:
 *
 * 1. The build values, checked and handed to the config — a build without them throws
 *    `NativeRuntimeEnvError` here, having started nothing, so the page keeps the session.
 * 2. The vault, waited for while it is locked (iOS, before the first unlock).
 * 3. The secret store, loaded through the step a page's boot runs (`prepareSecretStorage`): it
 *    finishes a logout whose clear was never confirmed before anything reads a token. There is no
 *    web storage behind the app, so the step's web copy and tab are empty.
 *    A vault left with no session stops the boot here with `NativeRuntimeNoSessionError`, having
 *    created nothing, and the page takes the launch.
 * 4. `createNativeRuntime`, with the loaded stores.
 *
 * Called once per launch; the caller keeps the engine for the rest of the process.
 */
export const bootNativeRuntime = async ({
    vault,
    env,
    appState,
    ...options
}: NativeRuntimeBootOptions): Promise<NativeRuntimeBoot> => {
    const missing = missingNativeRuntimeEnv(env);
    if (missing.length > 0) throw new NativeRuntimeEnvError(missing);
    config.init({
        env: createWebEnvAdapter(name => (name === 'CHATIC_APP_PLATFORM' ? Platform.OS : env(name))),
    });

    const read = await waitForUnlockedVault(vault, appState);

    const secretStorage = await prepareSecretStorage({
        vault: options.storage.secret,
        plain: options.storage.plain,
        web: new MemoryStore(),
        tab: new MemoryStore(),
        // Never from the address the last session ended with. A page's `?logout=1` belongs to the
        // document the logout opened and is gone on its next load; the app's saved address outlives
        // the logout while the process runs on, and a guest signed in after it would have its tokens
        // emptied at the next launch. The logout itself empties the vault before it ends, and leaves
        // `SECRET_LOGOUT_PENDING_KEY` in `plain` when that clear was not confirmed — which this step
        // reads on its own.
        afterLogout: false,
    });

    if (NO_SESSION_OUTCOMES.includes(secretStorage)) {
        // The address a session's end saved is read only by the runtime this boot no longer creates. The
        // page that takes the launch hears the same end on its own address, so the saved one goes now
        // rather than reaching a runtime launch days later.
        options.storage.plain.remove(HOME_SEARCH_KEY);
        throw new NativeRuntimeNoSessionError(secretStorage);
    }

    return { engine: createNativeRuntime(options), vault: read, secretStorage };
};
