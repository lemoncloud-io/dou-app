import { render, waitFor } from '@testing-library/react';

import { RuntimeConnectionHost } from '@chatic/app-runtime';
import { getSocketManager } from '../socket/runtime';
import { getDataManager } from '../data/runtime';
import { bootstrapSocketConnection } from '../socket';

jest.mock('@chatic/web-core', () => ({
    // RuntimeConnectionHost is the single init driver; gate returns ready so children render.
    useInitWebCore: jest.fn().mockReturnValue(true),
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
    const mockDataManager = { ensure: jest.fn() };
    return { getDataManager: jest.fn().mockReturnValue(mockDataManager) };
});

const mockedBootstrap = bootstrapSocketConnection as jest.MockedFunction<typeof bootstrapSocketConnection>;

describe('RuntimeConnectionHost', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedBootstrap.mockResolvedValue(jest.fn());
    });

    it('binds the data context and boots the socket via bootstrapSocketConnection (no delegate prop)', async () => {
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

        const dataManager = getDataManager();
        await waitFor(() => {
            expect(dataManager.ensure).toHaveBeenCalledWith(binding.context);
        });
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
