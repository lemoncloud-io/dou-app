import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { RuntimeConnectionHost } from './RuntimeConnectionHost';
import { getSocketRuntime, getSocketManager } from '../socket/runtime';
import { getDataManager } from '../data/runtime';
import { getSyncRuntime } from '../sync/runtime';
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
    };
    const mockManager = {
        ensure: jest.fn(),
        destroy: jest.fn(),
        connect: jest.fn(),
        getClient: jest.fn(),
    };
    return {
        getSocketRuntime: jest.fn().mockReturnValue({
            controller: mockController,
            proxy: {},
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

jest.mock('../sync/runtime', () => {
    const mockController = {
        ensure: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
    };

    return {
        getSyncRuntime: jest.fn().mockReturnValue({
            controller: mockController,
        }),
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
        };

        render(
            <RuntimeConnectionHost binding={binding} delegate={delegate}>
                <div>Test Children</div>
            </RuntimeConnectionHost>
        );

        await waitFor(() => {
            const socketRuntime = getSocketRuntime();
            expect(socketRuntime.controller.setDelegate).toHaveBeenCalledWith(delegate);
        });
    });

    it('triggers data, socket, and sync binders when the binding changes', async () => {
        const binding = {
            context: { cid: 'my-cloud', sid: 'site-1', uid: 'user-1' },
            socket: {
                config: { url: 'wss://test.com', deviceId: 'device-1' },
            },
        };

        const { rerender } = render(
            <RuntimeConnectionHost binding={binding} delegate={delegate}>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        const dataManager = getDataManager();
        const socketRuntime = getSocketRuntime();
        const syncRuntime = getSyncRuntime();

        await waitFor(() => {
            expect(dataManager.ensure).toHaveBeenCalledWith(binding.context);
        });
        await waitFor(() => {
            expect(socketRuntime.controller.bootstrap).toHaveBeenCalledWith(binding.socket.config);
        });
        await waitFor(() => {
            expect(syncRuntime.controller.ensure).toHaveBeenCalledWith(binding);
        });
        await waitFor(() => {
            expect(syncRuntime.controller.start).toHaveBeenCalled();
        });

        // 변경 테스트
        const newBinding = {
            context: { cid: 'my-cloud', sid: 'site-2', uid: 'user-1' },
            socket: null,
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
            expect(socketRuntime.controller.destroy).toHaveBeenCalled();
        });
        const socketManager = getSocketManager();
        await waitFor(() => {
            expect(socketManager.destroy).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(syncRuntime.controller.stop).toHaveBeenCalled();
        });
    });
});
