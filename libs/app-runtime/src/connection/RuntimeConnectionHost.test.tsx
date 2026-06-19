import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { RuntimeConnectionHost } from './RuntimeConnectionHost';
import { getSocketRuntime, getSocketManager } from '../socket/runtime';
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

describe('RuntimeConnectionHost', () => {
    let delegate: SocketSessionDelegate;

    beforeEach(() => {
        jest.clearAllMocks();
        delegate = {
            getSocketToken: jest.fn(),
            refreshSocketToken: jest.fn(),
        };
    });

    it('마운트 시 SocketSessionController에 delegate가 올바르게 주입되어야 한다', async () => {
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

    it('binding context와 socket 변경 시 각 binder가 ensure를 올바르게 트리거해야 한다', async () => {
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

        await waitFor(() => {
            expect(dataManager.ensure).toHaveBeenCalledWith(binding.context);
        });
        await waitFor(() => {
            expect(socketRuntime.controller.bootstrap).toHaveBeenCalledWith(binding.socket.config);
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
    });
});
