import type { ConfigRegistryModule } from '../types';

/**
 * Session, credential refresh and retry timing.
 *
 * `sdk.*` excludes `'server'` on purpose — a wrong remote value for refresh cadence can make every
 * device refresh at once, and undoing it remotely means writing this same value again while the
 * backend is already under the load it just caused. Only shell and local reach it.
 *
 * `sdk.*` is `'reconnect'`: `SocketManager` passes `AUTH_OPTIONS` to the SDK at socket construction,
 * so a changed value needs a reconnect to take effect.
 */
export const authModule: ConfigRegistryModule = {
    'auth.sdk.refreshRatio': {
        title: 'Auth refresh ratio',
        description: "Starts refreshing once this fraction of the credential's lifetime has passed.",
        type: 'number',
        defaultValue: 0.8,
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
        appliesAt: 'reconnect',
    },
    'auth.sdk.maxFailures': {
        title: 'Auth refresh failure limit',
        description: 'Marks the session expired after this many consecutive refresh failures.',
        type: 'number',
        defaultValue: 3,
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
        appliesAt: 'reconnect',
    },
    'auth.sdk.refreshIntervalMs': {
        title: 'Auth refresh interval',
        description: 'How often credentials are re-checked.',
        type: 'number',
        defaultValue: 300_000,
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
        appliesAt: 'reconnect',
    },
    'auth.verify.timeoutMs': {
        title: 'Auth verify timeout',
        description: "How long a socket auth verification request waits before it's treated as failed.",
        type: 'number',
        defaultValue: 10_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.staleness.checkIntervalMs': {
        title: 'Session staleness check interval',
        description: 'How often the session is checked for continued validity.',
        type: 'number',
        defaultValue: 30_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.staleness.forceRefreshCooldownMs': {
        title: 'Forced refresh minimum interval',
        description: 'The minimum gap kept between consecutive forced refreshes, to prevent a refresh storm.',
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.init.maxRetries': {
        title: 'Session init retry count',
        description: 'The maximum number of retries when session init fails at boot.',
        type: 'number',
        defaultValue: 3,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.init.retryDelayMs': {
        title: 'Session init retry interval',
        description: 'The wait time between session init retries.',
        type: 'number',
        defaultValue: 2_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.keepAlive.retryFloorMs': {
        title: 'Session keep-alive retry floor',
        description: 'The minimum gap kept between guest login retries.',
        type: 'number',
        defaultValue: 5_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.credential.retrySleepMs': {
        title: 'Credential reissue retry delay',
        description: 'How long to wait before retrying after a cloud credential reissue fails.',
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
