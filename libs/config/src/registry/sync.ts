import type { ConfigRegistryModule } from '../types';

/**
 * Socket and sync cadence. `profile.*` and `resume.*` include `'server'` — easing polling when the
 * backend is under load is the most legitimate use of that lane (ADR-0079 §second sweep).
 */
export const syncModule: ConfigRegistryModule = {
    'sync.profile.channelIntervalMs': {
        title: 'Channel member profile sync interval',
        description: "How often channel members' nicknames and avatars are re-checked.",
        type: 'number',
        defaultValue: 20_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.profile.listIntervalMs': {
        title: 'DM peer profile sync interval',
        description: "How often a DM peer's profile is re-checked on the list screen.",
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.unregisterGraceMs': {
        title: 'Sync unregister grace period',
        description: 'How long to wait after leaving a screen before actually removing it from sync targets.',
        type: 'number',
        defaultValue: 30_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.wake.kickThrottleMs': {
        title: 'Socket resume minimum interval',
        description: 'The minimum gap between attempts to wake the socket on screen return.',
        type: 'number',
        defaultValue: 5_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.resume.initialCooldownMs': {
        title: 'Post-expiry resume initial wait',
        description: 'The first wait time before retrying resume after the socket expires.',
        type: 'number',
        defaultValue: 30_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.resume.maxCooldownMs': {
        title: 'Post-expiry resume max wait',
        description: 'The ceiling the resume wait time grows to on repeated failures.',
        type: 'number',
        defaultValue: 300_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
