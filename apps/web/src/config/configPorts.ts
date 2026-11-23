import { hostProfile } from '@chatic/bridges';
import { createWebEnvAdapter, type ConfigRuntimePorts, type IShellKvAdapter } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';
import type { KeyValueStore } from '@chatic/storage';

import { onDuplicateKey, onShellWriteFailed } from './configPortCallbacks';
import { readBuildValue } from './viteEnv';

const read = (name: string): string | undefined => {
    if (name.startsWith('VITE_')) return readBuildValue(name);
    const globals: Readonly<Record<string, string | undefined>> = hostProfile().globals;
    if (name in globals) return globals[name];
    return (window as unknown as Record<string, string | undefined>)[name];
};

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
