/**
 * A send addressed to cloud A survives a switch to cloud B, end to end through the real
 * `SocketManager`, the real `SocketBinder`, the real background-slot selection and the real hold.
 * Only the SDK client factory, the session stores and the repository graph are fake: the graph's
 * `sendChat` is reduced to the one thing that matters here — a `chat.send` on the scoped client of
 * the cloud it was built for.
 *
 * The cloud is deliberately NOT in the joined list, so nothing but the hold keeps its slot after the
 * switch. The control case shows the same switch tearing the socket down under a send made without
 * one.
 */
import { render } from '@testing-library/react';
import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { SocketBinder } from './SocketBinder';
import { readyBackgroundConfigs } from './utils/backgroundSlots';
import { SocketManager } from '../socket/SocketManager';
import { bootstrapSocketConnection } from '../socket';
import type { SocketBindingConfig, SocketSessionDelegate } from '../socket';
import { resetBackgroundClouds } from '../socket/backgroundClouds';
import { getSocketManager } from '../socket/runtime';
import { slotKeyOf } from '../socket/utils/slotKey';
import { getCommittedCloudId } from '../session/store';
import { sendChatInCloud } from '../data/cloudChat';
import type { RuntimeSocketSlots } from './types';

jest.mock('@lemoncloud/chatic-sockets-lib', () => ({ createClientSocketV2: jest.fn() }));
jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../socket/runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('../socket/sync/runtime', () => ({ getSyncManager: jest.fn() }));
jest.mock('../socket', () => ({ bootstrapSocketConnection: jest.fn() }));
jest.mock('../session/store', () => ({ getCommittedCloudId: jest.fn() }));
jest.mock('../session/store/stores', () => ({
    cloudStore: {
        getRecentClouds: () => [],
        peekCachedCloudTokens: (cid: string) => ({
            delegationToken: { wss: `wss://${cid}` },
            cloudToken: { Token: { identityToken: `token-${cid}` } },
        }),
    },
}));
jest.mock('../session/auth/credentialFreshness', () => ({
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

/** One ack per client, resolved by the test, so the switch can land while it is outstanding. */
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

/** The slots as `useRuntimeSocketSlots` derives them: relay, the committed cloud, then the selection. */
const deriveSlots = (): RuntimeSocketSlots => {
    const committed = mockedCommitted();
    return {
        relay: { config: config('default', 'relay') },
        ...(committed ? { cloud: { config: config(committed) } } : {}),
        background: readyBackgroundConfigs('d').map(background => ({ config: background })),
    };
};

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

    const renderBinder = () => {
        const view = render(<SocketBinder slots={deriveSlots()} delegate={delegate} />);
        return () => view.rerender(<SocketBinder slots={deriveSlots()} delegate={delegate} />);
    };

    it("keeps A's socket through the switch to B, and the ack arrives on it", async () => {
        const reconcile = renderBinder();
        const clientA = manager.getClient(slotKeyOf('cloud-a'))!;

        const sent = sendChatInCloud('cloud-a', { channelId: 'ch-1', content: 'hello' });
        mockedCommitted.mockReturnValue('cloud-b');
        reconcile();

        // B is on screen; A is still bound, only because of the hold.
        expect(manager.getClient()).toBe(manager.getClient(slotKeyOf('cloud-b')));
        expect(manager.getSlotKeys()).toContain('cloud-a');
        expect(clientA.request).toHaveBeenCalledWith('chat.send', { channelId: 'ch-1', content: 'hello' }, undefined);
        expect(clientA.destroy).not.toHaveBeenCalled();

        acks.get(clientA)!({ id: 'ch-1:7' });
        await expect(sent).resolves.toEqual({ id: 'ch-1:7' });

        // Settled: the hold is gone, and A — not joined — goes on the next reconcile.
        reconcile();
        expect(manager.getSlotKeys()).not.toContain('cloud-a');
        expect(clientA.destroy).toHaveBeenCalled();
        expect(manager.getClient()).toBe(manager.getClient(slotKeyOf('cloud-b')));
    });

    it('control: without the hold, the same switch tears A down under the send', () => {
        const reconcile = renderBinder();
        const clientA = manager.getClient(slotKeyOf('cloud-a'))!;

        void manager.getScopedClient(slotKeyOf('cloud-a')).request('chat.send', { channelId: 'ch-1' });
        mockedCommitted.mockReturnValue('cloud-b');
        reconcile();

        expect(manager.getSlotKeys()).not.toContain('cloud-a');
        expect(clientA.destroy).toHaveBeenCalled();
    });
});
