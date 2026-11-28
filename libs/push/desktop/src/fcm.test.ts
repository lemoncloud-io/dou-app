import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PushHost } from './fcm';
import type * as PushModule from './push';

jest.mock('@liamcottle/push-receiver', () => {
    const clients: FakeClient[] = [];
    class FakeClient {
        readonly listeners = new Map<string, (value?: unknown) => void>();
        readonly destroy = jest.fn();
        constructor(
            readonly androidId: string,
            readonly securityToken: string,
            readonly persistentIds: string[]
        ) {
            clients.push(this);
        }
        on(event: string, listener: (value?: unknown) => void): void {
            this.listeners.set(event, listener);
        }
        connect(): Promise<void> {
            return Promise.resolve();
        }
    }
    return {
        clients,
        Client: FakeClient,
        AndroidFCM: { register: jest.fn(), installRequest: jest.fn(), registerRequest: jest.fn() },
    };
});

interface FakeClient {
    destroy: jest.Mock;
}

interface ReceiverMock {
    clients: FakeClient[];
    AndroidFCM: { register: jest.Mock; installRequest: jest.Mock; registerRequest: jest.Mock };
}

const config = { apiKey: 'k', projectId: 'p', senderId: 's', appId: 'a', packageName: 'n' };
const saved = { androidId: 'aid', securityToken: 'sec', token: 'old-token', persistentIds: ['p1'] };

const settle = async (): Promise<void> => {
    for (let i = 0; i < 10; i += 1) await new Promise(resolve => setImmediate(resolve));
};

const load = () => {
    let push!: typeof PushModule;
    let receiver!: ReceiverMock;
    jest.isolateModules(() => {
        push = jest.requireActual('./push');
        receiver = jest.requireMock('@liamcottle/push-receiver');
    });
    receiver.clients.length = 0;
    return { push, receiver };
};

const hostAt = (credentialsPath: string) => {
    const hooks: { wake?: () => void; focus?: () => void } = {};
    const host: PushHost & { keepAwake: jest.Mock } = {
        credentialsPath,
        onWake: reconnect => {
            hooks.wake = reconnect;
        },
        onFocus: reconnect => {
            hooks.focus = reconnect;
        },
        keepAwake: jest.fn(),
    };
    return { host, hooks };
};

describe('startPush with a host', () => {
    let dir: string;

    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
        jest.setSystemTime(1_000_000);
        dir = mkdtempSync(join(tmpdir(), 'push-desktop-'));
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('reads and rewrites the credentials at the path the host gives', async () => {
        const { push, receiver } = load();
        const path = join(dir, 'fcm.json');
        writeFileSync(path, JSON.stringify(saved));
        receiver.AndroidFCM.installRequest.mockResolvedValue('install');
        receiver.AndroidFCM.registerRequest.mockResolvedValue('fresh-token');
        const onToken = jest.fn();

        push.startPush(config, { onToken, onPush: jest.fn() }, hostAt(path).host);
        await settle();

        expect(receiver.AndroidFCM.registerRequest.mock.calls[0].slice(0, 2)).toEqual(['aid', 'sec']);
        expect(onToken).toHaveBeenCalledWith('fresh-token');
        expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ androidId: 'aid', token: 'fresh-token' });
    });

    it('registers from scratch and still starts when the credentials cannot be written', async () => {
        const { push, receiver } = load();
        receiver.AndroidFCM.register.mockResolvedValue({
            gcm: { androidId: 'new-aid', securityToken: 'new-sec' },
            fcm: { token: 'new-token' },
        });
        const onToken = jest.fn();

        push.startPush(config, { onToken, onPush: jest.fn() }, hostAt(join(dir, 'missing', 'fcm.json')).host);
        await settle();

        expect(onToken).toHaveBeenCalledWith('new-token');
        expect(receiver.clients).toHaveLength(1);
    });

    it('reconnects at once on a wake signal from the host', async () => {
        const { push, receiver } = load();
        writeFileSync(join(dir, 'fcm.json'), JSON.stringify(saved));
        receiver.AndroidFCM.installRequest.mockResolvedValue('install');
        receiver.AndroidFCM.registerRequest.mockResolvedValue('old-token');
        const { host, hooks } = hostAt(join(dir, 'fcm.json'));

        push.startPush(config, { onToken: jest.fn(), onPush: jest.fn() }, host);
        await settle();
        hooks.wake?.();

        expect(receiver.clients).toHaveLength(2);
        expect(receiver.clients[0].destroy).toHaveBeenCalled();
    });

    it('reconnects on focus at most once per 30 seconds', async () => {
        const { push, receiver } = load();
        writeFileSync(join(dir, 'fcm.json'), JSON.stringify(saved));
        receiver.AndroidFCM.installRequest.mockResolvedValue('install');
        receiver.AndroidFCM.registerRequest.mockResolvedValue('old-token');
        const { host, hooks } = hostAt(join(dir, 'fcm.json'));

        push.startPush(config, { onToken: jest.fn(), onPush: jest.fn() }, host);
        await settle();
        jest.setSystemTime(1_000_000 + 10_000);
        hooks.focus?.();
        expect(receiver.clients).toHaveLength(1);
        jest.setSystemTime(1_000_000 + 31_000);
        hooks.focus?.();
        expect(receiver.clients).toHaveLength(2);
    });

    it('hands each failure to the host onError instead of the console', async () => {
        const { push, receiver } = load();
        writeFileSync(join(dir, 'fcm.json'), JSON.stringify(saved));
        receiver.AndroidFCM.installRequest.mockRejectedValue(new Error('refresh down'));
        receiver.AndroidFCM.register.mockRejectedValue(new Error('register down'));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const onError = jest.fn();
        const onToken = jest.fn();

        push.startPush(config, { onToken, onPush: jest.fn() }, { ...hostAt(join(dir, 'fcm.json')).host, onError });
        await settle();
        warn.mockRestore();

        expect(onError.mock.calls.map(([stage]) => stage)).toEqual(['refresh', 'register']);
        expect(warn).not.toHaveBeenCalled();
        expect(onToken).toHaveBeenCalledWith('old-token');
    });

    it('takes the keep-awake hold only when FCM is configured', async () => {
        const unconfigured = load();
        const idle = hostAt(join(dir, 'fcm.json'));
        unconfigured.push.startPush({ ...config, apiKey: '' }, { onToken: jest.fn(), onPush: jest.fn() }, idle.host);
        await settle();
        expect(idle.host.keepAwake).not.toHaveBeenCalled();
        expect(idle.hooks.wake).toBeUndefined();

        const configured = load();
        configured.receiver.AndroidFCM.register.mockResolvedValue({
            gcm: { androidId: 'x', securityToken: 'y' },
            fcm: { token: 'z' },
        });
        const active = hostAt(join(dir, 'other.json'));
        configured.push.startPush(config, { onToken: jest.fn(), onPush: jest.fn() }, active.host);
        await settle();
        expect(active.host.keepAwake).toHaveBeenCalledTimes(1);
    });
});
