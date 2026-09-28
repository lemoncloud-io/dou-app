/**
 * Background slots end to end through the real `SocketManager` and the real `SocketBinder`: only the
 * SDK client factory is fake, and bootstrap is reduced to the one thing it does before its first
 * `await` — `ensure`. What these cases prove is the connection count: moving between clouds that all
 * hold a slot creates no client and destroys none.
 */
import { render } from '@testing-library/react';
import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { SocketBinder } from './SocketBinder';
import { SocketManager } from '../socket/SocketManager';
import { bootstrapSocketConnection } from '../socket';
import { getSocketManager } from '../socket/runtime';
import type { SocketBindingConfig, SocketSessionDelegate } from '../socket';
import type { RuntimeSocketSlots } from './types';
import { slotKeyOf } from '../socket/utils/slotKey';

jest.mock('@lemoncloud/chatic-sockets-lib', () => ({ createClientSocketV2: jest.fn() }));
jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../socket/runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('../socket/sync/runtime', () => ({ getSyncManager: jest.fn() }));
jest.mock('../socket', () => ({ bootstrapSocketConnection: jest.fn() }));

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

describe('background slots through the real manager and binder', () => {
    let manager: SocketManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedCreate.mockImplementation(() => makeClient());
        manager = new SocketManager();
        (getSocketManager as jest.Mock).mockReturnValue(manager);
        (bootstrapSocketConnection as jest.Mock).mockImplementation(({ manager: m, config }) => {
            m.ensure(config);
            return Promise.resolve(jest.fn());
        });
    });

    const renderBinder = (slots: RuntimeSocketSlots) => {
        const view = render(<SocketBinder slots={slots} delegate={delegate} />);
        return (next: RuntimeSocketSlots) => view.rerender(<SocketBinder slots={next} delegate={delegate} />);
    };

    it('A→B→A between two kept clouds reuses both clients and creates none', () => {
        const rerender = renderBinder({ relay, cloud: slot('cloud-a'), background: [slot('cloud-b')] });
        const clientA = manager.getClient(slotKeyOf('cloud-a'));
        const clientB = manager.getClient(slotKeyOf('cloud-b'));
        expect(mockedCreate).toHaveBeenCalledTimes(3);

        rerender({ relay, cloud: slot('cloud-b'), background: [slot('cloud-a')] });
        expect(manager.getClient()).toBe(clientB);

        rerender({ relay, cloud: slot('cloud-a'), background: [slot('cloud-b')] });
        expect(manager.getClient()).toBe(clientA);

        expect(mockedCreate).toHaveBeenCalledTimes(3);
        expect(clientA?.destroy).not.toHaveBeenCalled();
        expect(clientB?.destroy).not.toHaveBeenCalled();
    });

    it('going home leaves the cloud connected and the facade on relay', () => {
        const rerender = renderBinder({ relay, cloud: slot('cloud-a') });
        const clientA = manager.getClient(slotKeyOf('cloud-a'));

        rerender({ relay, background: [slot('cloud-a')] });

        expect(manager.getClient()).toBe(manager.getClient(slotKeyOf('default')));
        expect(manager.getClient(slotKeyOf('cloud-a'))).toBe(clientA);
        expect(clientA?.destroy).not.toHaveBeenCalled();
    });

    it('a cloud not kept in the background is still torn down on a switch, as before', () => {
        const rerender = renderBinder({ relay, cloud: slot('cloud-a') });
        const clientA = manager.getClient(slotKeyOf('cloud-a'));

        rerender({ relay, cloud: slot('cloud-b') });

        expect(manager.getSlotKeys()).not.toContain('cloud-a');
        expect(clientA?.destroy).toHaveBeenCalled();
    });
});
