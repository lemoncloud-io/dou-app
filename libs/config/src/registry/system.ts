import type { ConfigRegistryModule } from '../types';

/**
 * Resolver metadata — the two keys the lane machinery itself needs.
 *
 * `overridesUnlocked` opens the local lane (row 3). `remote.enabled` opens the two server rows.
 * Both use `meta: true`: they ARE the lock, so the generic panel does not render them and the
 * unlock gate does not apply to them (ADR-0079 decision 4/5).
 */
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
