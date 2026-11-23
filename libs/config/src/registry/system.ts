import type { ConfigRegistryModule } from '../types';

export const systemModule: ConfigRegistryModule = {
    'system.overridesUnlocked': {
        title: 'Override lock unlocked',
        description: 'Opens the web override lane (row 3). Unlocked with 10 taps plus an entry code.',
        type: 'boolean',
        defaultValue: true,
        byStage: { PROD: false },
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'session',
        meta: true,
    },
    'system.remote.enabled': {
        title: 'Remote config switch',
        description: 'Lets the server supply values. When off, the remote lane is always empty.',
        type: 'boolean',
        defaultValue: false,
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
        meta: true,
    },
};
