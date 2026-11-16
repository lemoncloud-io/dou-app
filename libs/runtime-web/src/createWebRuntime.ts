import { createRuntime } from '@chatic/runtime-core';
import type { RuntimeConfig, RuntimeEngine } from '@chatic/runtime-core';
import type { KeyValueStore } from '@chatic/storage';

import { webAuthPorts } from './auth';
import { webForegroundPorts } from './foreground';
import { webLocalCachePorts } from './localCache';
import { webTransportPorts } from './transport';

/**
 * What a web app decides for its runtime. Everything else a runtime takes from its platform, a page
 * answers the same way in every app, so `createWebRuntime` fills it in.
 */
export interface WebRuntimeOptions {
    /**
     * The session's two stores and the runtime's own `device` store — the app's choice, because a shell
     * keeps its session where a browser tab does not. `resolveStorageStores()` makes that choice for an
     * app that runs in both; a browser-only app hands over its own.
     */
    storage: RuntimeConfig['storage'];
    /**
     * The tab-lifetime store the web cache keeps a plain tab's invited clouds in. A cache must hear a
     * failed write, so it is a raw store rather than a tolerant one.
     */
    cacheTab: KeyValueStore;
    /** The key prefixes this app's own domains say a sign-out takes. */
    signedOutKeyPrefixes?: RuntimeConfig['signedOutKeyPrefixes'];
    /** The app's repository and cache policies. */
    data?: RuntimeConfig['data'];
}

/**
 * Builds the runtime for a web page and returns its engine, for `initAppRuntime(engine)`.
 *
 * The page's ports are the same in every web app: the browser's network and `WebSocket`, the page's
 * address and the way home, its visibility, and the cache's routing between IndexedDB and the phone
 * shell's database. Only the stores and the app's policies differ, and those are the options.
 *
 * It wires the runtime (`createRuntime`), so it is called once, from the entry point, after the app's
 * logging wiring and before anything reads the session.
 */
export const createWebRuntime = (options: WebRuntimeOptions): RuntimeEngine =>
    createRuntime({
        storage: options.storage,
        transport: webTransportPorts(),
        auth: webAuthPorts(),
        foreground: webForegroundPorts(),
        cache: webLocalCachePorts(options.cacheTab),
        signedOutKeyPrefixes: options.signedOutKeyPrefixes,
        data: options.data,
    });
