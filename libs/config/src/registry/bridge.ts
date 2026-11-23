import type { ConfigRegistryModule } from '../types';

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
