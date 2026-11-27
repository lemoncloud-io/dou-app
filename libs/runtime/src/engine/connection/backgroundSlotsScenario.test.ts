import { transportPlatform } from '@chatic/transport/platform';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { SocketBinder } from './SocketBinder';
import { SocketManager } from '@chatic/transport/socket/SocketManager';
import { bootstrapSocketConnection } from '@chatic/auth/socket/bootstrapSocketConnection';
import type { SocketBindingConfig } from '@chatic/transport/socket/types';
import type { SocketSessionDelegate } from '@chatic/auth/socket/types';
import type { RuntimeSocketSlots } from './types';
import { slotKeyOf } from '@chatic/transport/socket/utils/slotKey';

jest.mock('@lemoncloud/chatic-sockets-lib', () => ({ createClientSocketV2: jest.fn() }));
jest.mock('@chatic/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('@chatic/auth/socket/bootstrapSocketConnection', () => ({ bootstrapSocketConnection: jest.fn() }));

const mockedCreate = createClientSocketV2 as jest.MockedFunction<typeof createClientSocketV2>;

const makeClient = (): ClientSocketV2 =>
    ({
        request: jest.fn(),
        send: jest.fn(),
        onType: jest.fn().mockReturnValue(jest.fn()),
        onState: jest.fn().mockReturnValue(jest.fn()),
        onError: jest.fn().mockReturnValue(jest.fn()),
        onMessage: jest.fn().mockReturnValue(jest.fn()),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
        state: 'connected',
    }) as unknown as ClientSocketV2;

const delegate = {} as SocketSessionDelegate;
const slot = (cid: string, wssType: 'relay' | 'cloud' = 'cloud') => ({
    config: { url: `wss://${cid}`, deviceId: 'd', wssType, cid } as SocketBindingConfig,
});
const relay = slot('default', 'relay');

beforeEach(() => transportPlatform.configure(fakeTransportPorts()));

describe('background slots through the real manager and binder', () => {
    let manager: SocketManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedCreate.mockImplementation(() => makeClient());
        manager = new SocketManager();
        (bootstrapSocketConnection as jest.Mock).mockImplementation(({ manager: m, config }) => {
            m.ensure(config);
            return Promise.resolve(jest.fn());
        });
    });

    const startBinder = (slots: RuntimeSocketSlots) => {
        const binder = new SocketBinder(manager);
        binder.apply(slots, delegate);
        return (next: RuntimeSocketSlots) => binder.apply(next, delegate);
    };

    it('A→B→A between two kept clouds reuses both clients and creates none', () => {
        const pass = startBinder({ relay, cloud: slot('cloud-a'), background: [slot('cloud-b')] });
        const clientA = manager.getClient(slotKeyOf('cloud-a'));
        const clientB = manager.getClient(slotKeyOf('cloud-b'));
        expect(mockedCreate).toHaveBeenCalledTimes(3);

        pass({ relay, cloud: slot('cloud-b'), background: [slot('cloud-a')] });
        expect(manager.getClient()).toBe(clientB);

        pass({ relay, cloud: slot('cloud-a'), background: [slot('cloud-b')] });
        expect(manager.getClient()).toBe(clientA);

        expect(mockedCreate).toHaveBeenCalledTimes(3);
        expect(clientA?.destroy).not.toHaveBeenCalled();
        expect(clientB?.destroy).not.toHaveBeenCalled();
    });

    it('going home leaves the cloud connected and the facade on relay', () => {
        const pass = startBinder({ relay, cloud: slot('cloud-a') });
        const clientA = manager.getClient(slotKeyOf('cloud-a'));

        pass({ relay, background: [slot('cloud-a')] });

        expect(manager.getClient()).toBe(manager.getClient(slotKeyOf('default')));
        expect(manager.getClient(slotKeyOf('cloud-a'))).toBe(clientA);
        expect(clientA?.destroy).not.toHaveBeenCalled();
    });

    it('a cloud not kept in the background is still torn down on a switch, as before', () => {
        const pass = startBinder({ relay, cloud: slot('cloud-a') });
        const clientA = manager.getClient(slotKeyOf('cloud-a'));

        pass({ relay, cloud: slot('cloud-b') });

        expect(manager.getSlotKeys()).not.toContain('cloud-a');
        expect(clientA?.destroy).toHaveBeenCalled();
    });
});
