import type { ConfigRegistryModule } from '../types';

/**
 * Bridge timing. `request.timeoutMs` is `'restart'`: `WebBridgeClient`'s constructor captures it
 * into an instance field (`this.timeoutMs = config.timeoutMs ?? 10000`), so a changed value has no
 * effect until the client is rebuilt — and its own default disagreed with `provider.ts`'s `15000`
 * before this key existed, so which one was live depended on whether a call went through the
 * provider. One key now settles it.
 */
export const bridgeModule: ConfigRegistryModule = {
    'bridge.request.timeoutMs': {
        title: 'Bridge request timeout',
        description: 'Treats a request sent to the shell as unanswered after this much time.',
        type: 'number',
        defaultValue: 15_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'bridge.handshake.waitTimeoutMs': {
        title: 'Bridge handshake wait time',
        description: "How long to wait for the shell's ready signal before giving up.",
        type: 'number',
        defaultValue: 10_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
