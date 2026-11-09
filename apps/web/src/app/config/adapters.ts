import { isNative } from '@chatic/bridges';
import { createWebEnvAdapter, type ConfigRuntimePorts } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';
import { createShellKvAdapter } from './shellKvAdapter';
import { onDuplicateKey, onShellWriteFailed } from './configPortCallbacks';

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
 * The ports `config.init()` is called with. The two storage ports are the app's web media, built by
 * `resolveStorageMedia()` in `main.tsx` like every other medium; the config lib takes them in the DOM
 * `Storage` shape because it imports nothing.
 */
export const createWebConfigPorts = (media: {
    webLocal: KeyValueStore;
    webSession: KeyValueStore;
}): ConfigRuntimePorts => ({
    env: createWebEnvAdapter(read),
    storage: { local: asDomStorage(media.webLocal), session: asDomStorage(media.webSession) },
    // Only inside the native shell: a plain browser tab has no shell to round-trip a write to, and
    // leaving this unset (rather than wired-but-always-failing) is what keeps an unwired `persist:
    // 'shell'` key a silent no-op instead of a spurious `onShellWriteFailed` on every page load.
    shell: isNative() ? createShellKvAdapter() : undefined,
    // Both live in `configPortCallbacks.ts` so they can be unit-tested — this file's
    // `import.meta.env` read makes it unloadable under the test transform.
    onDuplicateKey,
    onShellWriteFailed,
});
