import { hostProfile } from '@chatic/bridges';
import { createWebEnvAdapter, type ConfigRuntimePorts } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';
import { createShellKvAdapter } from './shellKvAdapter';
import { onDuplicateKey, onShellWriteFailed } from './configPortCallbacks';

/**
 * Wires `@chatic/config` to this app's own `import.meta.env` and the shell's injected `CHATIC_APP_*`
 * globals, read through `@chatic/bridges`' host profile — the one file per Vite app that `import.meta` is allowed to touch.
 *
 * `read` is the only platform-specific piece; `createWebEnvAdapter` owns the shared interpretation
 * (stage validation, the shell-injected stage vocabulary, the legacy lowercasing) so web ·
 * desktop-web · admin share one tested implementation instead of three.
 */
const read = (name: string): string | undefined => {
    if (name.startsWith('VITE_')) return (import.meta.env as Record<string, string | undefined>)[name];
    // A boot global the shell injected comes from the host profile, which took it at boot.
    const globals: Readonly<Record<string, string | undefined>> = hostProfile().globals;
    if (name in globals) return globals[name];
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
    // Only inside the native shell: a plain browser tab has no shell to round-trip a write to, and
    // leaving this unset (rather than wired-but-always-failing) is what keeps an unwired `persist:
    // 'shell'` key a silent no-op instead of a spurious `onShellWriteFailed` on every page load.
    shell: hostProfile().bridge ? createShellKvAdapter() : undefined,
    // Both live in `configPortCallbacks.ts` so they can be unit-tested — this file's
    // `import.meta.env` read makes it unloadable under the test transform.
    onDuplicateKey,
    onShellWriteFailed,
});
