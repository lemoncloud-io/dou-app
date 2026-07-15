import { render } from '@testing-library/react';

import { SocketBinder } from './SocketBinder';
import { bootstrapSocketConnection } from '../socket';
import { getSocketManager } from '../socket/runtime';
import type { RuntimeBinding } from '../runtime';
import type { SocketSessionDelegate } from '../socket';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const destroy = jest.fn();
jest.mock('../socket/runtime', () => ({
    getSocketManager: jest.fn(),
}));

jest.mock('../socket', () => ({
    bootstrapSocketConnection: jest.fn(),
}));

const mockedBootstrap = bootstrapSocketConnection as jest.MockedFunction<typeof bootstrapSocketConnection>;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;

const delegate = { getAuthRegistration: jest.fn() } as unknown as SocketSessionDelegate;

const relaySlot = { config: { url: 'wss://relay', deviceId: 'd', wssType: 'relay' as const, cid: 'default' } };
const cloudSlot = { config: { url: 'wss://cloud', deviceId: 'd', wssType: 'cloud' as const, cid: 'my-cloud' } };

const bindingOf = (socket: RuntimeBinding['socket']): RuntimeBinding =>
    ({ context: { cid: 'default', sid: undefined, uid: 'u' }, socket, auth: undefined }) as unknown as RuntimeBinding;

describe('SocketBinder (dual slots)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedBootstrap.mockResolvedValue(jest.fn());
        mockedGetManager.mockReturnValue({ destroy } as never);
    });

    const configsBooted = () => mockedBootstrap.mock.calls.map(call => call[0].config);

    it('relay-only: boots relay and tears down the absent cloud slot', async () => {
        render(<SocketBinder binding={bindingOf({ relay: relaySlot })} delegate={delegate} />);

        expect(configsBooted()).toEqual([relaySlot.config]);
        expect(destroy).toHaveBeenCalledWith('cloud');
        expect(destroy).not.toHaveBeenCalledWith('relay');
    });

    it('cloud active: boots BOTH relay and cloud independently', async () => {
        render(<SocketBinder binding={bindingOf({ relay: relaySlot, cloud: cloudSlot })} delegate={delegate} />);

        expect(configsBooted()).toEqual(expect.arrayContaining([relaySlot.config, cloudSlot.config]));
        expect(mockedBootstrap).toHaveBeenCalledTimes(2);
        expect(destroy).not.toHaveBeenCalled();
    });

    it('leaving a cloud tears down ONLY cloud; the relay slot is never rebooted', async () => {
        const { rerender } = render(
            <SocketBinder binding={bindingOf({ relay: relaySlot, cloud: cloudSlot })} delegate={delegate} />
        );
        expect(mockedBootstrap).toHaveBeenCalledTimes(2);

        mockedBootstrap.mockClear();
        rerender(<SocketBinder binding={bindingOf({ relay: relaySlot })} delegate={delegate} />);

        // relay's reboot key is unchanged → no re-bootstrap; only cloud is destroyed.
        expect(mockedBootstrap).not.toHaveBeenCalled();
        expect(destroy).toHaveBeenCalledWith('cloud');
        expect(destroy).not.toHaveBeenCalledWith('relay');
    });
});
