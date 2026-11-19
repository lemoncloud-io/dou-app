import { hostProfile } from '@chatic/bridges';
import { createWebEnvAdapter, type ConfigRuntimePorts, type IShellKvAdapter } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';
import type { KeyValueStore } from '@chatic/storage';

import { onDuplicateKey, onShellWriteFailed } from './configPortCallbacks';
import { readBuildValue } from './viteEnv';

/**
 * Where a setting's environment value comes from: this build's `VITE_*` values, then the shell's
 * injected `CHATIC_APP_*` globals, read through `@chatic/bridges`' host profile.
 *
 * `read` is the only platform-specific piece; `createWebEnvAdapter` owns the shared interpretation
 * (stage validation, the shell-injected stage vocabulary, the legacy lowercasing) so web ·
 * desktop-web · admin share one tested implementation instead of three.
 */
const read = (name: string): string | undefined => {
    if (name.startsWith('VITE_')) return readBuildValue(name);
    // A boot global the shell injected comes from the host profile, which took it at boot.
    const globals: Readonly<Record<string, string | undefined>> = hostProfile().globals;
    if (name in globals) return globals[name];
    return (window as unknown as Record<string, string | undefined>)[name];
};

/**
 * The ports `@chatic/config` is initialised with — a declaration's `config`, which `startRuntime`
 * initialises config from before it reads a port toggle.
 *
 * The two storage ports are the app's raw web stores, the ones `resolveStorageStores()` built in
 * `main.tsx`; the config lib takes them in the DOM `Storage` shape because it imports nothing. They
 * must be those very objects: where site data is blocked each is page memory, and config's session lane
 * would otherwise not see the rows the session and the cache keep in the same tab store.
 *
 * `shell` is the config bag's lane in the native shell. A plain browser tab has no shell to round-trip a
 * write to, and leaving it unset (rather than wired-but-always-failing) is what keeps an unwired
 * `persist: 'shell'` key a silent no-op instead of a spurious `onShellWriteFailed` on every page load.
 */
export const createWebConfigPorts = (
    stores: { webLocal: KeyValueStore; webSession: KeyValueStore },
    { shell }: { shell?: IShellKvAdapter } = {}
): ConfigRuntimePorts => ({
    env: createWebEnvAdapter(read),
    storage: { local: asDomStorage(stores.webLocal), session: asDomStorage(stores.webSession) },
    shell,
    onDuplicateKey,
    onShellWriteFailed,
});
