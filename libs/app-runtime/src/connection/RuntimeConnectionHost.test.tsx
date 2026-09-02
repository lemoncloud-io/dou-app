import { render, waitFor } from '@testing-library/react';

import { RuntimeConnectionHost } from './RuntimeConnectionHost';
import { getSocketManager } from '../socket/runtime';
import { bootstrapSocketConnection } from '../socket';

jest.mock('../session', () => ({
    // RuntimeConnectionHost is the single init driver; gate returns ready so children render.
    useRelaySessionInit: jest.fn().mockReturnValue(true),
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
    return {
        getSocketManager: jest.fn().mockReturnValue(mockManager),
        getSyncManager: jest.fn(),
        getSocketRuntime: jest.fn(),
    };
});

jest.mock('../data/runtime', () => {
    const mockDataManager = { getRepositories: jest.fn(), getContext: jest.fn() };
    return { getDataManager: jest.fn().mockReturnValue(mockDataManager) };
});

const mockedBootstrap = bootstrapSocketConnection as jest.MockedFunction<typeof bootstrapSocketConnection>;

describe('RuntimeConnectionHost', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedBootstrap.mockResolvedValue(jest.fn());
    });

    it('데이터 스코프를 밀어 넣지 않고 소켓만 부팅한다 (delegate prop 없이)', async () => {
        const binding = {
            context: { cid: 'my-cloud', sid: 'site-1', uid: 'user-1' },
            socket: {
                cloud: { config: { url: 'wss://test.com', deviceId: 'device-1', wssType: 'cloud' as const } },
            },
            auth: { kind: 'cloud' as const, identityToken: 'token-1', siteId: 'site-1' },
        };

        render(
            <RuntimeConnectionHost binding={binding}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        // 데이터 스코프는 더 이상 여기서 밀어 넣지 않는다 — ActiveScope가 session/store에서 읽는다
        // (ADR-0070 결정 7). push가 effect에서 돌던 탓에 하위 훅이 낡은 cid로 구독하던 문제를 없앤 변경.
        // 밀어 넣을 API 자체가 사라져서(IDataManager에 ensure 없음) 이제 타입이 그 사실을 지킨다.
        await waitFor(() => {
            // The delegate is created internally and passed through to bootstrap.
            expect(mockedBootstrap).toHaveBeenCalledWith(
                expect.objectContaining({
                    config: binding.socket.cloud.config,
                    delegate: expect.objectContaining({ getAuthRegistration: expect.any(Function) }),
                })
            );
        });
    });

    it('tears down the socket when the binding loses its socket', async () => {
        const binding = {
            context: { cid: 'my-cloud', sid: 'site-1', uid: 'user-1' },
            socket: {
                cloud: { config: { url: 'wss://test.com', deviceId: 'device-1', wssType: 'cloud' as const } },
            },
            auth: { kind: 'cloud' as const, identityToken: 'token-1', siteId: 'site-1' },
        };

        const { rerender } = render(
            <RuntimeConnectionHost binding={binding}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        await waitFor(() => {
            expect(mockedBootstrap).toHaveBeenCalledTimes(1);
        });

        const newBinding = {
            context: { cid: 'my-cloud', sid: 'site-2', uid: 'user-1' },
            socket: {},
            auth: { kind: 'cloud' as const, identityToken: 'token-2', siteId: 'site-2' },
        };

        rerender(
            <RuntimeConnectionHost binding={newBinding}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        const socketManager = getSocketManager();
        await waitFor(() => {
            expect(socketManager.destroy).toHaveBeenCalled();
        });
    });
});
