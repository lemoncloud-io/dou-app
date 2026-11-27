import { transportPlatform } from '@chatic/transport/platform';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { SocketBinder } from './SocketBinder';
import { readyBackgroundConfigs } from './backgroundSlots';
import { SocketManager } from '@chatic/transport/socket/SocketManager';
import { bootstrapSocketConnection } from '@chatic/auth/socket/bootstrapSocketConnection';
import type { SocketBindingConfig } from '@chatic/transport/socket/types';
import type { SocketSessionDelegate } from '@chatic/auth/socket/types';
import { resetBackgroundClouds } from '@chatic/transport/socket/backgroundClouds';
import { getSocketManager } from '@chatic/transport/socket/runtime';
import { slotKeyOf } from '@chatic/transport/socket/utils/slotKey';
import { getCommittedCloudId } from '@chatic/session/store';
import { sendChatInCloud } from '../data/cloudChat';
import type { RuntimeSocketSlots } from './types';

jest.mock('@lemoncloud/chatic-sockets-lib', () => ({ createClientSocketV2: jest.fn() }));
jest.mock('@chatic/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('@chatic/transport/socket/runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('@chatic/auth/socket/bootstrapSocketConnection', () => ({ bootstrapSocketConnection: jest.fn() }));
jest.mock('@chatic/session/store', () => ({ getCommittedCloudId: jest.fn() }));
jest.mock('@chatic/session/store/stores', () => ({
    cloudStore: {
        getRecentClouds: () => [],
        peekCachedCloudTokens: (cid: string) => ({
            delegationToken: { wss: `wss://${cid}` },
            cloudToken: { Token: { identityToken: `token-${cid}` } },
        }),
    },
}));
jest.mock('@chatic/session/store/credentialFreshness', () => ({
    credentialFreshness: { timeToExpiry: () => 60 * 60_000 },
}));
jest.mock('../data/runtime', () => ({
    getDataManager: () => ({
        getScopedRepositories: (cid: string) => ({
            chat: {
                sendChat: (payload: unknown) =>
                    (getSocketManager() as SocketManager).getScopedClient(slotKeyOf(cid)).request('chat.send', payload),
            },
        }),
    }),
}));

const mockedCreate = createClientSocketV2 as jest.MockedFunction<typeof createClientSocketV2>;
const mockedCommitted = getCommittedCloudId as jest.MockedFunction<typeof getCommittedCloudId>;

const acks = new Map<ClientSocketV2, (value: unknown) => void>();

const makeClient = (): ClientSocketV2 => {
    const client = {
        request: jest.fn(() => new Promise(resolve => acks.set(client, resolve))),
        send: jest.fn(),
        onType: jest.fn().mockReturnValue(jest.fn()),
        onState: jest.fn().mockReturnValue(jest.fn()),
        onError: jest.fn().mockReturnValue(jest.fn()),
        onMessage: jest.fn().mockReturnValue(jest.fn()),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
        state: 'connected',
    } as unknown as ClientSocketV2;
    return client;
};

const delegate = {} as SocketSessionDelegate;
const config = (cid: string, wssType: 'relay' | 'cloud' = 'cloud'): SocketBindingConfig => ({
    url: `wss://${cid}`,
    deviceId: 'd',
    wssType,
    cid,
});

const deriveSlots = (): RuntimeSocketSlots => {
    const committed = mockedCommitted();
    return {
        relay: { config: config('default', 'relay') },
        ...(committed ? { cloud: { config: config(committed) } } : {}),
        background: readyBackgroundConfigs('d').map(background => ({ config: background })),
    };
};

beforeEach(() => transportPlatform.configure(fakeTransportPorts()));

describe('a send addressed to its cloud, across a switch', () => {
    let manager: SocketManager;

    beforeEach(() => {
        jest.clearAllMocks();
        acks.clear();
        resetBackgroundClouds();
        mockedCreate.mockImplementation(() => makeClient());
        manager = new SocketManager();
        (getSocketManager as jest.Mock).mockReturnValue(manager);
        (bootstrapSocketConnection as jest.Mock).mockImplementation(({ manager: m, config: c }) => {
            m.ensure(c);
            return Promise.resolve(jest.fn());
        });
        mockedCommitted.mockReturnValue('cloud-a');
    });

    const startBinder = () => {
        const binder = new SocketBinder(manager);
        binder.apply(deriveSlots(), delegate);
        return () => binder.apply(deriveSlots(), delegate);
    };

    it("keeps A's socket through the switch to B, and the ack arrives on it", async () => {
        const reconcile = startBinder();
        const clientA = manager.getClient(slotKeyOf('cloud-a'))!;

        const sent = sendChatInCloud('cloud-a', { channelId: 'ch-1', content: 'hello' });
        mockedCommitted.mockReturnValue('cloud-b');
        reconcile();

        expect(manager.getClient()).toBe(manager.getClient(slotKeyOf('cloud-b')));
        expect(manager.getSlotKeys()).toContain('cloud-a');
        expect(clientA.request).toHaveBeenCalledWith('chat.send', { channelId: 'ch-1', content: 'hello' }, undefined);
        expect(clientA.destroy).not.toHaveBeenCalled();

        acks.get(clientA)!({ id: 'ch-1:7' });
        await expect(sent).resolves.toEqual({ id: 'ch-1:7' });

        reconcile();
        expect(manager.getSlotKeys()).not.toContain('cloud-a');
        expect(clientA.destroy).toHaveBeenCalled();
        expect(manager.getClient()).toBe(manager.getClient(slotKeyOf('cloud-b')));
    });

    it('control: without the hold, the same switch tears A down under the send', () => {
        const reconcile = startBinder();
        const clientA = manager.getClient(slotKeyOf('cloud-a'))!;

        void manager.getScopedClient(slotKeyOf('cloud-a')).request('chat.send', { channelId: 'ch-1' });
        mockedCommitted.mockReturnValue('cloud-b');
        reconcile();

        expect(manager.getSlotKeys()).not.toContain('cloud-a');
        expect(clientA.destroy).toHaveBeenCalled();
    });
});
