import { hostProfile } from '@chatic/bridges';
import { createWebEnvAdapter, type ConfigRuntimePorts } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';

import { localStore, tabStore } from '../../app/storage';

const read = (name: string): string | undefined => {
    if (name.startsWith('VITE_')) return (import.meta.env as Record<string, string | undefined>)[name];
    const globals: Readonly<Record<string, string | undefined>> = hostProfile().globals;
    if (name in globals) return globals[name];
    return (window as unknown as Record<string, string | undefined>)[name];
};

export const webConfigPorts: ConfigRuntimePorts = {
    env: createWebEnvAdapter(read),
    storage: { local: asDomStorage(localStore), session: asDomStorage(tabStore) },
};
