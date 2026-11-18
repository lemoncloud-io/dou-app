import type { Adapter, PortName } from '@chatic/runtime-client';
import type { RuntimePorts } from '@chatic/runtime-core';
import type { CacheBridgeClient } from '@chatic/db';

import { nativeAuthPorts } from '../auth';
import { loadNativeSession } from '../boot';
import { nativeForegroundPorts } from '../foreground';
import type { AppStateSource } from '../foreground';
import { readNativeHostFacts } from '../hostFacts';
import type { NativeHostFacts, NativeHostFactsOptions } from '../hostFacts';
import { nativeLocalCachePorts } from '../localCache';
import { assertSecureRandom } from '../randomValues';
import { nativeStoragePorts } from '../storage';
import type { NativeStorageOptions } from '../storage';
import { nativeTransportPorts } from '../transport';

/**
 * An adapter for React Native's process: one way of filling one port, asked about the process's
 * `NativeHostFacts`. The ports that sit on the app's own native modules — the vault, the key-value
 * files, the database, the way home — are adapters made from those handles (`storageMobileVault(…)`),
 * because the app opens them and this package links none.
 */
export type MobileAdapter<P extends PortName> = Adapter<P, RuntimePorts[P], NativeHostFacts>;

/**
 * The host facts a mobile declaration is resolved against, from the user agent the app resolved
 * before the start. Reading them is the first step of a start, so this is also where a process that
 * never imported `@chatic/runtime-mobile/polyfills` is stopped, before anything draws a random number.
 */
export const mobileHostFacts =
    (options: NativeHostFactsOptions): (() => NativeHostFacts) =>
    () => {
        assertSecureRandom();
        return readNativeHostFacts(options);
    };

/** `transport.mobile` — NetInfo, `Platform.OS`, and React Native's `WebSocket` sending the app's user agent. */
export const transportMobile: MobileAdapter<'transport'> = {
    id: 'transport.mobile',
    port: 'transport',
    create: ({ facts }) => nativeTransportPorts({ userAgent: facts.userAgent }),
};

/** `foreground.app-state` — React Native's `AppState`, passed on only when in front flips. */
export const foregroundAppState: MobileAdapter<'foreground'> = {
    id: 'foreground.app-state',
    port: 'foreground',
    create: () => nativeForegroundPorts(),
};

export interface MobileAuthOptions {
    /** The app's own way home once a session's end is saved for the next launch. */
    leaveToHome: RuntimePorts['auth']['leaveToHome'];
}

/** `auth.mobile` — the address a session ended with, carried to the next launch in the `plain` store. */
export const authMobile = ({ leaveToHome }: MobileAuthOptions): MobileAdapter<'auth'> => ({
    id: 'auth.mobile',
    port: 'auth',
    create: ({ storage }) => nativeAuthPorts({ plain: storage.plain, leaveToHome }),
});

export interface MobileVaultStorageOptions extends NativeStorageOptions {
    /** The app's state, for the locked-vault wait. React Native's `AppState` when left out. */
    appState?: AppStateSource;
}

/**
 * `storage.mobile-vault` — the session's secrets in the device vault the WebView's pages use, the
 * plain and device state in key-value files of the runtime's own. Loaded here as the boot loads it: a
 * locked vault is waited out, and a vault left with no session throws `NativeRuntimeNoSessionError`
 * before anything is built, so the page takes the launch.
 */
export const storageMobileVault = ({ appState, ...options }: MobileVaultStorageOptions): MobileAdapter<'storage'> => ({
    id: 'storage.mobile-vault',
    port: 'storage',
    create: async () => {
        const storage = nativeStoragePorts(options);
        await loadNativeSession(storage, options.vault, appState);
        return storage;
    },
});

/** `cache.mobile-sqlite` — every domain in the app's database, through `client`. */
export const cacheMobileSqlite = (client: CacheBridgeClient): MobileAdapter<'cache'> => ({
    id: 'cache.mobile-sqlite',
    port: 'cache',
    create: () => nativeLocalCachePorts(client),
});
