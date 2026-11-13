import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeRuntimeConnection } from '@chatic/runtime-core/testing/connection';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import {
    getRuntimeSocketState,
    getSlotStatuses,
    observeSocketRequests,
    onServerEvent,
    onServerMessage,
    reconnectSocket,
    recoverSocketsOnResume,
    recoverUnverifiedSockets,
    requestOnSlot,
    waitUntilVerified,
} from './connectionCommands';

const members = {
    waitUntilVerified: jest.fn(async () => true),
    requestOnSlot: jest.fn(async () => ({ id: 'me' })),
    onServerEvent: jest.fn(() => jest.fn()),
    onServerMessage: jest.fn(() => jest.fn()),
    observeRequests: jest.fn(),
    slotStatuses: jest.fn(async () => []),
    reconnect: jest.fn(async () => undefined),
    recoverUnverified: jest.fn(async () => undefined),
    recoverOnResume: jest.fn(async () => undefined),
};
const active = { state: 'connected', isConnected: true, isVerified: true, connectionId: 'c-1' };

beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({ ...coreEngine, connection: fakeRuntimeConnection({ active: active as never }, members as never) });
});

afterEach(() => resetRuntimeEngine());

describe("the sockets the app drives outside React, through the engine's connection", () => {
    it('reads the active socket at the moment of the call', () => {
        expect(getRuntimeSocketState()).toBe(active);
    });

    it('waits on the active slot when none is named, and on a named one', async () => {
        await waitUntilVerified(undefined, 5000);
        await waitUntilVerified('default' as never);

        expect(members.waitUntilVerified.mock.calls).toEqual([
            [null, 5000],
            ['default', undefined],
        ]);
    });

    it('sends on a slot, and hears its pushes and every frame', async () => {
        const listener = jest.fn();

        await expect(requestOnSlot('default' as never, 'user.profile')).resolves.toEqual({ id: 'me' });
        onServerEvent('join.sync', listener, { slot: 'default' as never });
        onServerMessage(listener);

        expect(members.requestOnSlot).toHaveBeenCalledWith('default', 'user.profile', undefined, undefined);
        expect(members.onServerEvent).toHaveBeenCalledWith('join.sync', listener, { slot: 'default' });
        expect(members.onServerMessage).toHaveBeenCalledWith(listener);
    });

    it('times requests, lists slots, and kicks and recovers the sockets', async () => {
        const observer = jest.fn();

        const stop = jest.fn();
        members.observeRequests.mockReturnValueOnce(stop);
        expect(observeSocketRequests(observer)).toBe(stop);
        await getSlotStatuses();
        await reconnectSocket();
        await recoverUnverifiedSockets();
        await recoverSocketsOnResume();

        expect(members.observeRequests).toHaveBeenCalledWith(observer);
        expect(members.slotStatuses).toHaveBeenCalledTimes(1);
        expect(members.reconnect).toHaveBeenCalledTimes(1);
        expect(members.recoverUnverified).toHaveBeenCalledTimes(1);
        expect(members.recoverOnResume).toHaveBeenCalledTimes(1);
    });
});
