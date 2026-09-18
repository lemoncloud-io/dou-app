import { render, waitFor } from '@testing-library/react';

import { RuntimeAuthHost, RuntimeConnectionHost } from './RuntimeConnectionHost';
import { getSocketManager } from '../socket/runtime';
import { bootstrapSocketConnection } from '../socket';
import { useDynamicDeviceId } from '../session/hooks/app/useDynamicDeviceId';
import { getSocketSlotContext } from '../session/store';

// The boot gate now comes from its concrete module (the session barrel stopped selling it), so it
// gets its own mock — gate returns ready so children render.
jest.mock('../session/hooks/app/useRelaySessionInit', () => ({
    useRelaySessionInit: jest.fn().mockReturnValue(true),
}));

// Mocked at its concrete path (the host's own import) so the ONE difference between the two hosts is
// observable as an argument. The real hook ran here before, incidentally — nothing asserted it, and
// it only reached the store snapshot the `../session/store` mock below already supplies.
const mockKeepAlive = jest.fn();
jest.mock('../session/hooks/app/useRelaySessionKeepAlive', () => ({
    useRelaySessionKeepAlive: (enabled: boolean) => mockKeepAlive(enabled),
}));

// The host derives its own slots now (ADR-0076 G5), so `useRuntimeSocketSlots` runs even when a
// test passes `slots` explicitly. The device id is one of its two inputs; the other is the narrow
// session snapshot, overridden on `../session/store` below. Mocked at the hook's CONCRETE path
// because that is what the slots hook imports — the session barrel publishes it outward only.
jest.mock('../session/hooks/app/useDynamicDeviceId', () => ({
    useDynamicDeviceId: jest.fn(() => ({ deviceId: 'device-1' })),
}));

jest.mock('../session', () => ({
    useRelaySessionKeepAlive: jest.fn(),
    // Consumed by useSocketSessionDelegate (the delegate is now owned by app-runtime).
    getServerAuthRegistration: jest.fn(),
    signServerAuth: jest.fn(),
    commitServerRefreshedToken: jest.fn(),
    logoutCloudSession: jest.fn(),
}));

// SocketBinder boots through the pure bootstrapSocketConnection; intercept it to assert wiring.
// SocketReauthBinder calls reauthenticateActiveSocket on same-socket identity changes.
jest.mock('../socket', () => ({
    bootstrapSocketConnection: jest.fn().mockResolvedValue(jest.fn()),
    reauthenticateActiveSocket: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../socket/runtime', () => {
    const mockManager = { destroy: jest.fn() };
    return { getSocketManager: jest.fn().mockReturnValue(mockManager) };
});
// Sync has its own creation point now (socket/sync/runtime.ts); SocketBinder reaches it directly.
jest.mock('../socket/sync/runtime', () => ({ getSyncManager: jest.fn() }));

// SPREAD the real module: `useRelaySessionKeepAlive` (mounted by this host, from its concrete path)
// reaches `useSessionAuth` → `subscribeSessionSignal` + `getSessionAuthSnapshot`, which live here. A
// narrow mock leaves those undefined and `useSyncExternalStore` fails with "getSnapshot is not a
// function" — a crash three frames away from the mock that caused it.
jest.mock('../session/store', () => ({
    ...jest.requireActual('../session/store'),
    getCommittedCloudId: jest.fn().mockReturnValue(null),
    getSocketSlotContext: jest.fn(),
}));

jest.mock('../data/runtime', () => {
    const mockDataManager = { getRepositories: jest.fn(), getContext: jest.fn() };
    return { getDataManager: jest.fn().mockReturnValue(mockDataManager) };
});

const mockedBootstrap = bootstrapSocketConnection as jest.MockedFunction<typeof bootstrapSocketConnection>;
const mockedSlotContext = getSocketSlotContext as jest.MockedFunction<typeof getSocketSlotContext>;
const mockedDeviceId = useDynamicDeviceId as jest.MockedFunction<typeof useDynamicDeviceId>;

/** No relay token, no cloud → the derived slots are empty, so an explicit prop is what boots. */
const noSession = {
    relay: { wss: 'wss://relay', identityToken: null },
    cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
} as never;

const cloudSlots = {
    cloud: { config: { url: 'wss://test.com', deviceId: 'device-1', wssType: 'cloud' as const, cid: 'my-cloud' } },
};

/**
 * The two hosts are one component with a single switch flipped. That switch is these two cases —
 * apart from turning guest keep-alive on or off, the init gate, the socket auth loop, and
 * reauthentication are all identical.
 *
 * This is why they're split by name: if it were a prop with a default, the moment a caller forgot
 * to pass the prop it would silently get a guest session. That regression has no symptom on
 * screen, so the test is the only line of defense.
 */
describe('두 호스트의 유일한 차이 — 게스트 keep-alive', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedBootstrap.mockResolvedValue(jest.fn());
        mockedDeviceId.mockReturnValue({ deviceId: 'device-1' } as never);
        mockedSlotContext.mockReturnValue(noSession);
    });

    it('RuntimeConnectionHost는 게스트를 살려 둔다', () => {
        render(<RuntimeConnectionHost />);

        expect(mockKeepAlive).toHaveBeenCalledWith(true);
    });

    it('RuntimeAuthHost는 살려 두지 않는다 — 명시 로그인 전까지 세션이 없어야 하는 표면', () => {
        render(<RuntimeAuthHost />);

        expect(mockKeepAlive).toHaveBeenCalledWith(false);
    });
});

describe('RuntimeConnectionHost', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedBootstrap.mockResolvedValue(jest.fn());
        mockedDeviceId.mockReturnValue({ deviceId: 'device-1' } as never);
        mockedSlotContext.mockReturnValue(noSession);
    });

    it('데이터 스코프를 밀어 넣지 않고 소켓만 부팅한다 (delegate prop 없이)', async () => {
        render(
            <RuntimeConnectionHost slots={cloudSlots}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        // The data scope is no longer pushed in here — ActiveScope reads it from session/store
        // (ADR-0070 Decision 7). This is the change that removed the bug where a downstream hook
        // subscribed with a stale cid because the push ran in an effect. The push API itself is
        // gone now (no `ensure` on IDataManager), so the type system enforces that fact.
        await waitFor(() => {
            // The delegate is created internally and passed through to bootstrap.
            expect(mockedBootstrap).toHaveBeenCalledWith(
                expect.objectContaining({
                    config: cloudSlots.cloud.config,
                    delegate: expect.objectContaining({ getAuthRegistration: expect.any(Function) }),
                })
            );
        });
    });

    it('tears down the socket when the slots lose that kind', async () => {
        const { rerender } = render(
            <RuntimeConnectionHost slots={cloudSlots}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        await waitFor(() => {
            expect(mockedBootstrap).toHaveBeenCalledTimes(1);
        });

        rerender(
            <RuntimeConnectionHost slots={{}}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        const socketManager = getSocketManager();
        await waitFor(() => {
            expect(socketManager.destroy).toHaveBeenCalled();
        });
    });

    // The point of G5: an app mounts the host and passes NOTHING. Before this, all four apps ran
    // `const binding = useRuntimeBinding()` and handed it straight back down — four copies of one
    // line whose only job was to move a value the host could read itself.
    it('slots prop 없이도 세션에서 슬롯을 스스로 파생해 부팅한다', async () => {
        mockedSlotContext.mockReturnValue({
            relay: { wss: 'wss://relay', identityToken: 'relay-token' },
            cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
        } as never);

        render(
            <RuntimeConnectionHost>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        await waitFor(() => {
            expect(mockedBootstrap).toHaveBeenCalledWith(
                expect.objectContaining({
                    config: { url: 'wss://relay', deviceId: 'device-1', wssType: 'relay', cid: 'default' },
                })
            );
        });
    });
});
