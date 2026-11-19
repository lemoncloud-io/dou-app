import { hostProfile } from '@chatic/bridges';
import { createWebEnvAdapter, type ConfigRuntimePorts } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';

import { localStore, tabStore } from '../../app/storage';

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

export const webConfigPorts: ConfigRuntimePorts = {
    env: createWebEnvAdapter(read),
    storage: { local: asDomStorage(localStore), session: asDomStorage(tabStore) },
};
