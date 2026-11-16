import { createRuntime } from '@chatic/runtime-core';
import type { RuntimeConfig, RuntimeEngine } from '@chatic/runtime-core';

import { nativeAuthPorts } from './auth';
import { nativeForegroundPorts } from './foreground';
import { assertSecureRandom } from './randomValues';
import { nativeTransportPorts } from './transport';

/**
 * What a native app hands its runtime. The device's network, its app state and its sockets are the
 * same for every React Native app, so `createNativeRuntime` fills those; where state is kept and what
 * the app does when a session ends are the app's.
 */
export interface NativeRuntimeOptions {
    /**
     * The session's two stores and the runtime's own `device` store. They are the app's to build on its
     * own native storage — the credentials in the device vault (`nativeSecretStore`), the rest in
     * key-value files (`keyValueStoreOn`) — and they have to be readable synchronously and loaded before
     * this call. The parameters a session ends with wait for the next launch in `plain` too.
     */
    storage: RuntimeConfig['storage'];
    /**
     * Where the cache's rows live: each domain's store, the search across clouds, the metrics — the
     * app's database, through `nativeLocalCachePorts`.
     */
    cache: RuntimeConfig['cache'];
    /**
     * The user agent this device reports, sent as the socket handshake's `User-Agent`. It must be the
     * string the app reports everywhere else for this device; see `NativeDeviceOptions`.
     */
    userAgent: string;
    /**
     * What happens when a session ends: the app's way home, and the moment to drop the in-memory state
     * a page drops by reloading. Called with the parameters a page would navigate to `/` with
     * (`logout=1` among them), after they are saved for the next launch's boot to read.
     */
    leaveToHome: RuntimeConfig['auth']['leaveToHome'];
    /** The key prefixes this app's own domains say a sign-out takes. */
    signedOutKeyPrefixes?: RuntimeConfig['signedOutKeyPrefixes'];
    /** The app's repository and cache policies. */
    data?: RuntimeConfig['data'];
}

/**
 * Builds the runtime in React Native's JS process and returns its engine.
 *
 * It fills the ports a native process answers the same way in every app — NetInfo for the network,
 * `AppState` for the foreground, React Native's `WebSocket` with the User-Agent header, the OS for the
 * device — takes the stores, the cache and the way home from the app, and calls `createRuntime`.
 *
 * It wires the runtime, so it is called once per launch, from the app's entry, after the app's config
 * and logging are set up and after `@chatic/runtime-mobile/polyfills` has been imported. It checks the
 * last of those itself and throws when the secure random source is missing.
 */
export const createNativeRuntime = (options: NativeRuntimeOptions): RuntimeEngine => {
    assertSecureRandom();
    return createRuntime({
        storage: options.storage,
        transport: nativeTransportPorts({ userAgent: options.userAgent }),
        auth: nativeAuthPorts(options.storage.plain, options.leaveToHome),
        foreground: nativeForegroundPorts(),
        cache: options.cache,
        signedOutKeyPrefixes: options.signedOutKeyPrefixes,
        data: options.data,
    });
};
