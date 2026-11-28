import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { FcmConfig, FcmPush, PushHost } from '@chatic/push-desktop';

import { FCM_ENV, readFcmConfig, startSidecarPush } from './sidecarPush';

const load = createRequire(__filename);

const env = {
    VITE_FCM_API_KEY: 'k',
    VITE_FCM_PROJECT_ID: 'p',
    VITE_FCM_SENDER_ID: 's',
    VITE_FCM_APP_ID: 'a',
    VITE_FCM_PACKAGE: 'n',
};

type Handlers = { onToken: (token: string) => void; onPush: (push: FcmPush) => void };

const harness = (call = jest.fn(async () => ({ accepted: true }))) => {
    const logs: string[] = [];
    let handlers: Handlers | undefined;
    let host: PushHost | undefined;
    const start = jest.fn((_config: FcmConfig, given: Handlers, givenHost: PushHost) => {
        handlers = given;
        host = givenHost;
    });
    return {
        call,
        logs,
        start,
        handlers: () => handlers as Handlers,
        host: () => host as PushHost,
        options: (overrides: Partial<Parameters<typeof startSidecarPush>[0]> = {}) => ({
            profile: '/profiles/one',
            env,
            call,
            log: (line: string) => logs.push(line),
            start,
            ...overrides,
        }),
    };
};

const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('readFcmConfig', () => {
    it('reads the five values from the env', () => {
        expect(readFcmConfig(env, {})).toEqual({
            apiKey: 'k',
            projectId: 'p',
            senderId: 's',
            appId: 'a',
            packageName: 'n',
        });
    });

    it('is off when any value is missing', () => {
        expect(readFcmConfig({ ...env, VITE_FCM_APP_ID: '' }, {})).toBeNull();
        expect(readFcmConfig({}, {})).toBeNull();
    });

    it('falls back to the values built in, and the env wins over them', () => {
        expect(readFcmConfig({}, env)?.apiKey).toBe('k');
        expect(readFcmConfig({ VITE_FCM_API_KEY: 'runtime' }, env)?.apiKey).toBe('runtime');
    });

    it('names the same variables the sidecar build bakes in', () => {
        expect(Object.values(FCM_ENV)).toEqual(load('../../scripts/bundle-options.cjs').FCM_KEYS);
    });
});

describe('startSidecarPush', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('tells the shell that push is off when FCM is not configured', async () => {
        const h = harness();
        startSidecarPush(h.options({ env: {} }));
        await settle();
        expect(h.start).not.toHaveBeenCalled();
        expect(h.call.mock.calls).toEqual([['push_token', { token: null }]]);
    });

    it('starts FCM with the profile credentials and forwards the token and each push', async () => {
        const h = harness();
        startSidecarPush(h.options());
        expect(h.host().credentialsPath).toBe(join('/profiles/one', 'node', 'fcm.json'));

        h.handlers().onToken('token-1');
        h.handlers().onPush({
            title: 'Alex',
            body: 'hi',
            deeplink: 'chatic://channel?channelId=c1',
            data: { cid: 'c' },
        });
        await settle();

        expect(h.call.mock.calls).toEqual([
            ['push_token', { token: 'token-1' }],
            [
                'push_message',
                { title: 'Alex', body: 'hi', deeplink: 'chatic://channel?channelId=c1', data: { cid: 'c' } },
            ],
        ]);
    });

    it('retries the token until the shell takes it, and a newer token replaces it', async () => {
        const call = jest
            .fn()
            .mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'shell_unavailable' }))
            .mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'shell_unavailable' }))
            .mockResolvedValue({ accepted: true });
        const h = harness(call);
        startSidecarPush(h.options());
        h.handlers().onToken('token-1');
        await settle();
        h.handlers().onToken('token-2');
        await settle();
        jest.advanceTimersByTime(2_000);
        await settle();
        jest.advanceTimersByTime(2_000);
        await settle();

        expect(call.mock.calls.map(([, params]) => params)).toEqual([
            { token: 'token-1' },
            { token: 'token-2' },
            { token: 'token-2' },
        ]);
    });

    it('logs the token length and the failure code, never a value', async () => {
        const call = jest.fn().mockRejectedValue(Object.assign(new Error('down'), { code: 'shell_unavailable' }));
        const h = harness(call);
        const secrets = Object.fromEntries(Object.keys(env).map(name => [name, `secret-${name}`]));
        startSidecarPush(h.options({ retries: 1, env: secrets }));
        h.handlers().onToken('a-secret-token-value');
        h.handlers().onPush({ title: 'secret title', data: {} });
        await settle();

        const text = h.logs.join('\n');
        expect(text).toContain('(20 chars)');
        expect(text).toContain('shell_unavailable');
        expect(text).not.toContain('a-secret-token-value');
        expect(text).not.toContain('secret title');
        expect(text).not.toContain('secret-');
    });

    it('logs a failure the push library reports by its code only', () => {
        const h = harness();
        startSidecarPush(h.options());
        h.host().onError?.('start', Object.assign(new Error('rejected key secret-value'), { code: 'ERR_BAD_REQUEST' }));
        expect(h.logs).toEqual(['push: start failed (ERR_BAD_REQUEST)']);
    });

    it('stops retrying once disposed', async () => {
        const call = jest.fn().mockRejectedValue(new Error('down'));
        const h = harness(call);
        const dispose = startSidecarPush(h.options());
        h.handlers().onToken('token-1');
        await settle();
        dispose();
        jest.advanceTimersByTime(60_000);
        await settle();
        expect(call).toHaveBeenCalledTimes(1);
    });
});
