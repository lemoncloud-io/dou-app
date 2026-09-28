import { StrictMode } from 'react';
import { render } from '@testing-library/react';

import { SocketBinder } from './SocketBinder';
import { bootstrapSocketConnection } from '../socket';
import { getSocketManager } from '../socket/runtime';
import type { SlotKey, SocketBindingConfig, SocketSessionDelegate } from '../socket';
import type { RuntimeSocketSlots } from './types';
import { RELAY_SLOT, slotKeyOf } from '../socket/utils/slotKey';

import { logger } from '@chatic/bridges';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../socket/runtime', () => ({
    getSocketManager: jest.fn(),
}));

// The binder reaches the sync engine so it exists before slots bind; the assertion here is only that
// a slot boots, so the engine itself is stubbed.
jest.mock('../socket/sync/runtime', () => ({
    getSyncManager: jest.fn(),
}));

jest.mock('../socket', () => ({
    bootstrapSocketConnection: jest.fn(),
}));

const mockHasLiveJoinedSession = jest.fn((_cid: string) => false);
jest.mock('../socket/backgroundClouds', () => ({
    hasLiveJoinedSession: (cid: string) => mockHasLiveJoinedSession(cid),
}));
const mockNotifySocketLogout = jest.fn();
jest.mock('../socket/auth/logoutSession', () => ({
    notifySocketLogout: (...args: unknown[]) => mockNotifySocketLogout(...args),
}));

const mockedBootstrap = bootstrapSocketConnection as jest.MockedFunction<typeof bootstrapSocketConnection>;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;

const delegate = { getAuthRegistration: jest.fn() } as unknown as SocketSessionDelegate;

const relaySlot = { config: { url: 'wss://relay', deviceId: 'd', wssType: 'relay' as const, cid: 'default' } };
const cloudA = { config: { url: 'wss://cloud-a', deviceId: 'd', wssType: 'cloud' as const, cid: 'cloud-a' } };
const cloudB = { config: { url: 'wss://cloud-b', deviceId: 'd', wssType: 'cloud' as const, cid: 'cloud-b' } };

const A = slotKeyOf('cloud-a');
const B = slotKeyOf('cloud-b');

/**
 * Just enough of SocketManager to observe the reconcile order: a slot counts as bound from the moment
 * bootstrap is called, because the real bootstrap calls `ensure` before its first `await`.
 */
const makeManager = () => {
    const bound = new Set<SlotKey>();
    const log: string[] = [];
    const manager = {
        setActiveSlot: jest.fn((key: SlotKey | null) => log.push(`active ${key ?? 'relay'}`)),
        destroy: jest.fn((key: SlotKey) => {
            bound.delete(key);
            log.push(`torn down ${key}`);
        }),
        getClient: jest.fn(() => null),
        getSlotKeys: jest.fn(() => [...bound]),
    };
    mockedBootstrap.mockImplementation(({ config }: { config: SocketBindingConfig }) => {
        const key = slotKeyOf(config.cid);
        bound.add(key);
        log.push(`bound ${key}`);
        return Promise.resolve(jest.fn());
    });
    return { manager, bound, log };
};

describe('SocketBinder (one reconciler for every slot)', () => {
    let fake: ReturnType<typeof makeManager>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasLiveJoinedSession.mockReturnValue(false);
        mockNotifySocketLogout.mockImplementation((key: SlotKey) => fake.log.push(`signed off ${key}`));
        fake = makeManager();
        mockedGetManager.mockReturnValue(fake.manager as never);
    });

    const configsBooted = () => mockedBootstrap.mock.calls.map(call => call[0].config);
    const renderBinder = (slots: RuntimeSocketSlots) => {
        const view = render(<SocketBinder slots={slots} delegate={delegate} />);
        return {
            ...view,
            rerender: (next: RuntimeSocketSlots) => view.rerender(<SocketBinder slots={next} delegate={delegate} />),
        };
    };

    it('relay-only: boots relay, points the facade at relay, tears nothing down', () => {
        renderBinder({ relay: relaySlot });

        expect(configsBooted()).toEqual([relaySlot.config]);
        expect(fake.manager.setActiveSlot).toHaveBeenCalledWith(null);
        expect(fake.manager.destroy).not.toHaveBeenCalled();
    });

    it('cloud committed: boots relay and the cloud, then points the facade at the cloud', () => {
        renderBinder({ relay: relaySlot, cloud: cloudA });

        expect(fake.log).toEqual([`bound ${RELAY_SLOT}`, `bound ${A}`, `active ${A}`]);
    });

    it('a cloud switch reads bound B → active B → torn down A, and never reboots relay', () => {
        const { rerender } = renderBinder({ relay: relaySlot, cloud: cloudA });
        fake.log.length = 0;
        mockedBootstrap.mockClear();

        rerender({ relay: relaySlot, cloud: cloudB });

        expect(fake.log).toEqual([`bound ${B}`, `active ${B}`, `torn down ${A}`]);
        expect(configsBooted()).toEqual([cloudB.config]);
    });

    // This used to be the one switch the binder could not do: the reboot key held, so the socket
    // stayed up serving the outgoing cloud, and a dedicated guard reported it. With slots keyed by
    // the cloud, B is a different slot whatever its URL.
    it('a switch to a cloud on the same wss host is an ordinary switch — no error, B gets its own slot', () => {
        const sameHostB = { config: { ...cloudB.config, url: cloudA.config.url } };
        const { rerender } = renderBinder({ relay: relaySlot, cloud: cloudA });
        fake.log.length = 0;

        rerender({ relay: relaySlot, cloud: sameHostB });

        expect(fake.log).toEqual([`bound ${B}`, `active ${B}`, `torn down ${A}`]);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('leaving a cloud points the facade back at relay before the cloud is torn down', () => {
        const { rerender } = renderBinder({ relay: relaySlot, cloud: cloudA });
        fake.log.length = 0;
        mockedBootstrap.mockClear();

        rerender({ relay: relaySlot });

        expect(fake.log).toEqual(['active relay', `torn down ${A}`]);
        expect(mockedBootstrap).not.toHaveBeenCalled();
    });

    describe('background slots', () => {
        const cloudC = { config: { url: 'wss://cloud-c', deviceId: 'd', wssType: 'cloud' as const, cid: 'cloud-c' } };
        const C = slotKeyOf('cloud-c');

        it('boots every background cloud beside the committed one, and keeps the facade on the committed', () => {
            renderBinder({ relay: relaySlot, cloud: cloudA, background: [cloudB, cloudC] });

            expect(fake.log).toEqual([`bound ${RELAY_SLOT}`, `bound ${B}`, `bound ${C}`, `bound ${A}`, `active ${A}`]);
        });

        it('A→B with B in the background moves the pointer only: nothing bound, nothing torn down', () => {
            const { rerender } = renderBinder({ relay: relaySlot, cloud: cloudA, background: [cloudB] });
            fake.log.length = 0;
            mockedBootstrap.mockClear();

            // After the commit, A is the background one and B the committed one — same keys, same configs.
            rerender({ relay: relaySlot, cloud: cloudB, background: [cloudA] });

            expect(fake.log).toEqual([`active ${B}`]);
            expect(mockedBootstrap).not.toHaveBeenCalled();
            expect(fake.manager.destroy).not.toHaveBeenCalled();
        });

        it('going home keeps a background cloud bound and moves the facade to relay', () => {
            const { rerender } = renderBinder({ relay: relaySlot, cloud: cloudA });
            fake.log.length = 0;
            mockedBootstrap.mockClear();

            rerender({ relay: relaySlot, background: [cloudA] });

            expect(fake.log).toEqual(['active relay']);
            expect(mockedBootstrap).not.toHaveBeenCalled();
        });

        it('a cloud dropped from the background list is torn down', () => {
            const { rerender } = renderBinder({ relay: relaySlot, background: [cloudA, cloudB] });
            fake.log.length = 0;

            rerender({ relay: relaySlot, background: [cloudB] });

            expect(fake.log).toEqual(['active relay', `torn down ${A}`]);
        });

        it('signs a cloud off before tearing it down when it still has a live session — pushed past the cap', () => {
            mockHasLiveJoinedSession.mockImplementation(cid => cid === 'cloud-a');
            const { rerender } = renderBinder({ relay: relaySlot, background: [cloudA, cloudB] });
            fake.log.length = 0;

            rerender({ relay: relaySlot, background: [cloudB] });

            expect(fake.log).toEqual(['active relay', `signed off ${A}`, `torn down ${A}`]);
            expect(mockNotifySocketLogout).toHaveBeenCalledWith(A, fake.manager);
        });

        it('tears down without signing off a cloud that has no live session — left, or already expired', () => {
            const { rerender } = renderBinder({ relay: relaySlot, background: [cloudA] });
            fake.log.length = 0;

            rerender({ relay: relaySlot });

            expect(fake.log).toEqual(['active relay', `torn down ${A}`]);
        });

        it('signs nothing off when the relay goes too — the account logout already notified every slot', () => {
            mockHasLiveJoinedSession.mockReturnValue(true);
            const { rerender } = renderBinder({ relay: relaySlot, background: [cloudA] });

            rerender({});

            expect(mockNotifySocketLogout).not.toHaveBeenCalled();
        });

        it('should both name one cloud, the committed config is the one that binds', () => {
            const stale = { config: { ...cloudA.config, url: 'wss://stale' } };

            renderBinder({ relay: relaySlot, cloud: cloudA, background: [stale] });

            expect(configsBooted()).toEqual([relaySlot.config, cloudA.config]);
        });
    });

    it('a re-render with equal slots boots nothing', () => {
        const { rerender } = renderBinder({ relay: relaySlot, cloud: cloudA });
        mockedBootstrap.mockClear();

        rerender({ relay: { ...relaySlot }, cloud: { config: { ...cloudA.config } } });

        expect(mockedBootstrap).not.toHaveBeenCalled();
        expect(fake.manager.destroy).not.toHaveBeenCalled();
    });

    it('a moved reboot key re-boots that slot alone and detaches its previous boot', async () => {
        const firstCleanup = jest.fn();
        mockedBootstrap.mockImplementationOnce(({ config }) => {
            fake.bound.add(slotKeyOf(config.cid));
            return Promise.resolve(jest.fn());
        });
        mockedBootstrap.mockImplementationOnce(({ config }) => {
            fake.bound.add(slotKeyOf(config.cid));
            return Promise.resolve(firstCleanup);
        });
        const { rerender } = renderBinder({ relay: relaySlot, cloud: cloudA });
        await Promise.resolve();
        mockedBootstrap.mockClear();

        rerender({ relay: relaySlot, cloud: { config: { ...cloudA.config, url: 'wss://cloud-a-2' } } });

        // Same slot, new URL: `ensure` inside bootstrap rebuilds the client, so nothing is destroyed.
        expect(configsBooted()).toEqual([{ ...cloudA.config, url: 'wss://cloud-a-2' }]);
        expect(firstCleanup).toHaveBeenCalledTimes(1);
        expect(fake.manager.destroy).not.toHaveBeenCalled();
    });

    it('tears down a slot the manager holds even when this binder never booted it', () => {
        // A remount forgets what the previous mount booted; the manager does not.
        fake.bound.add(A);

        renderBinder({ relay: relaySlot });

        expect(fake.manager.destroy).toHaveBeenCalledWith(A);
        expect(fake.manager.destroy).not.toHaveBeenCalledWith(RELAY_SLOT);
    });

    it('StrictMode: the first boot detaches itself, the second is kept, and no socket is destroyed', async () => {
        const cleanups: jest.Mock[] = [];
        mockedBootstrap.mockImplementation(({ config }) => {
            fake.bound.add(slotKeyOf(config.cid));
            const cleanup = jest.fn();
            cleanups.push(cleanup);
            return Promise.resolve(cleanup);
        });

        const { unmount } = render(
            <StrictMode>
                <SocketBinder slots={{ relay: relaySlot, cloud: cloudA }} delegate={delegate} />
            </StrictMode>
        );
        await Promise.resolve();

        // Two mounts → two boots per slot. The first mount's boots resolve after it was unmounted.
        expect(cleanups).toHaveLength(4);
        expect(cleanups.slice(0, 2).map(c => c.mock.calls.length)).toEqual([1, 1]);
        expect(cleanups.slice(2).map(c => c.mock.calls.length)).toEqual([0, 0]);
        expect(fake.manager.destroy).not.toHaveBeenCalled();
        expect(fake.manager.setActiveSlot).toHaveBeenLastCalledWith(A);

        unmount();
        expect(cleanups.slice(2).map(c => c.mock.calls.length)).toEqual([1, 1]);
        expect(fake.manager.destroy).not.toHaveBeenCalled();
    });

    it('reports a failed bootstrap with the slot it was for', async () => {
        mockedBootstrap.mockRejectedValueOnce(new Error('boom'));

        renderBinder({ relay: relaySlot });
        await Promise.resolve();
        await Promise.resolve();

        expect(logger.error).toHaveBeenCalledWith(
            'SOCKET',
            '[SocketBinder] bootstrap failed',
            expect.objectContaining({ data: { cid: 'default', kind: 'relay', active: false } })
        );
    });

    it('forgets a failed boot, so the next reconcile retries it and the log says the pointer is stranded', async () => {
        mockedBootstrap.mockImplementationOnce(({ config }) => {
            fake.bound.add(slotKeyOf(config.cid));
            return Promise.resolve(jest.fn());
        });
        mockedBootstrap.mockRejectedValueOnce(new Error('a cloud config cannot bind the relay slot'));
        const { rerender } = renderBinder({ relay: relaySlot, cloud: cloudA });
        await Promise.resolve();
        await Promise.resolve();
        expect(logger.error).toHaveBeenCalledWith(
            'SOCKET',
            '[SocketBinder] bootstrap failed',
            expect.objectContaining({ data: { cid: 'cloud-a', kind: 'cloud', active: true } })
        );
        mockedBootstrap.mockClear();

        // Any later pass re-boots it — here the relay slot's device id moved.
        rerender({ relay: { config: { ...relaySlot.config, deviceId: 'd2' } }, cloud: cloudA });

        expect(configsBooted()).toEqual(expect.arrayContaining([cloudA.config]));
    });
});
