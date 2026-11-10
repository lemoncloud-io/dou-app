import { createWebEnvAdapter, type ConfigRuntimePorts } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * Wires `@chatic/config` to this app's own `import.meta.env` and injected `window.CHATIC_APP_*`
 * globals — the one file per Vite app that `import.meta` is allowed to touch (ADR-0079 decisions 1·8).
 *
 * `read` is the only platform-specific piece; `createWebEnvAdapter` owns the shared interpretation
 * (stage validation, the shell-injected stage vocabulary, the legacy lowercasing) so web ·
 * desktop-web · admin share one tested implementation instead of three.
 */
const read = (name: string): string | undefined => {
    if (name.startsWith('VITE_')) return (import.meta.env as Record<string, string | undefined>)[name];
    return (window as unknown as Record<string, string | undefined>)[name];
};

/**
 * The ports `config.init()` is called with. The two storage ports are the app's web stores, built by
 * `resolveStorageStores()` in `main.tsx` like every other store; the config lib takes them in the DOM
 * `Storage` shape because it imports nothing.
 */
export const createWebConfigPorts = (stores: {
    webLocal: KeyValueStore;
    webSession: KeyValueStore;
}): ConfigRuntimePorts => ({
    env: createWebEnvAdapter(read),
    storage: { local: asDomStorage(stores.webLocal), session: asDomStorage(stores.webSession) },
});
