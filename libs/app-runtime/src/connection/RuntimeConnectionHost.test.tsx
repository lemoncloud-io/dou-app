import { render, waitFor } from '@testing-library/react';
import { RuntimeConnectionHost } from './RuntimeConnectionHost';
import { getSocketManager, getSocketRuntime } from '../socket/runtime';
import { getDataManager } from '../data/runtime';
import type { SocketSessionDelegate } from '../socket/types';

jest.mock('@chatic/web-core', () => ({
    startWebCoreInit: jest.fn().mockResolvedValue(undefined),
    useInitWebCore: jest.fn().mockReturnValue(true),
    useRelaySessionKeepAlive: jest.fn(),
    useTokenRefresh: jest.fn(),
    useDynamicDeviceId: jest.fn().mockReturnValue({ deviceId: 'test-device-id', isReady: true }),
}));

jest.mock('../socket/runtime', () => {
    const mockController = {
        setDelegate: jest.fn(),
        bootstrap: jest.fn(),
        destroy: jest.fn(),
        updateAuth: jest.fn(),
    };
    const mockManager = {
        ensure: jest.fn(),
        destroy: jest.fn(),
        connect: jest.fn(),
        getClient: jest.fn(),
        markUnverified: jest.fn(),
    };
    return {
        getSocketRuntime: jest.fn().mockReturnValue({
            sessionController: mockController,
            syncManager: {},
        }),
        getSocketManager: jest.fn().mockReturnValue(mockManager),
    };
});

jest.mock('../data/runtime', () => {
    const mockDataManager = {
        ensure: jest.fn(),
    };
    return {
        getDataManager: jest.fn().mockReturnValue(mockDataManager),
    };
});

describe('RuntimeConnectionHost', () => {
    let delegate: SocketSessionDelegate;

    beforeEach(() => {
        jest.clearAllMocks();
        delegate = {
            getSocketToken: jest.fn(),
            refreshSocketToken: jest.fn(),
        };
    });

    it('injects the delegate into SocketSessionController on mount', async () => {
        const binding = {
            context: { cid: 'default' },
            socket: null,
            auth: {
                kind: 'relay' as const,
                identityToken: undefined,
                siteId: undefined,
            },
        };

        render(
            <RuntimeConnectionHost binding={binding} delegate={delegate}>
                <div>Test Children</div>
            </RuntimeConnectionHost>
        );

        await waitFor(() => {
            const socketRuntime = getSocketRuntime();
            expect(socketRuntime.sessionController.setDelegate).toHaveBeenCalledWith(delegate);
        });
    });

    it('triggers data and socket binders when the binding changes', async () => {
        const binding = {
            context: { cid: 'my-cloud', sid: 'site-1', uid: 'user-1' },
            socket: {
                config: { url: 'wss://test.com', deviceId: 'device-1' },
            },
            auth: {
                kind: 'cloud' as const,
                identityToken: 'token-1',
                siteId: 'site-1',
            },
        };

        const { rerender } = render(
            <RuntimeConnectionHost binding={binding} delegate={delegate}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        const dataManager = getDataManager();
        const socketRuntime = getSocketRuntime();

        await waitFor(() => {
            expect(dataManager.ensure).toHaveBeenCalledWith(binding.context);
        });
        await waitFor(() => {
            expect(socketRuntime.sessionController.bootstrap).toHaveBeenCalledWith(binding.socket.config);
        });

        // 변경 테스트
        const newBinding = {
            context: { cid: 'my-cloud', sid: 'site-2', uid: 'user-1' },
            socket: null,
            auth: {
                kind: 'cloud' as const,
                identityToken: 'token-2',
                siteId: 'site-2',
            },
        };

        rerender(
            <RuntimeConnectionHost binding={newBinding} delegate={delegate}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        await waitFor(() => {
            expect(dataManager.ensure).toHaveBeenCalledWith(newBinding.context);
        });
        await waitFor(() => {
            expect(socketRuntime.sessionController.destroy).toHaveBeenCalled();
        });
        const socketManager = getSocketManager();
        await waitFor(() => {
            expect(socketManager.destroy).toHaveBeenCalled();
        });
    });

    it('keeps the same socket but reauthenticates when the auth session changes', async () => {
        const binding = {
            context: { cid: 'my-cloud', sid: 'site-1', uid: 'user-1' },
            socket: {
                config: { url: 'wss://test.com', deviceId: 'device-1', wssType: 'cloud' as const },
            },
            auth: {
                kind: 'cloud' as const,
                identityToken: 'token-1',
                siteId: 'site-1',
            },
        };

        const { rerender } = render(
            <RuntimeConnectionHost binding={binding} delegate={delegate}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        const socketRuntime = getSocketRuntime();
        const socketManager = getSocketManager();

        await waitFor(() => {
            expect(socketRuntime.sessionController.bootstrap).toHaveBeenCalledWith(binding.socket.config);
        });

        jest.clearAllMocks();

        const nextBinding = {
            context: { cid: 'my-cloud', sid: 'site-2', uid: 'user-1' },
            socket: {
                config: { url: 'wss://test.com', deviceId: 'device-1', wssType: 'cloud' as const },
            },
            auth: {
                kind: 'cloud' as const,
                identityToken: 'token-2',
                siteId: 'site-2',
            },
        };

        rerender(
            <RuntimeConnectionHost binding={nextBinding} delegate={delegate}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        await waitFor(() => {
            expect(socketManager.markUnverified).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(socketRuntime.sessionController.updateAuth).toHaveBeenCalledWith('session-switch');
        });
        expect(socketRuntime.sessionController.bootstrap).not.toHaveBeenCalled();
    });
});
