import { renderHook, act } from '@testing-library/react';

import { useFcmHandler } from './useFcmHandler';
import { notificationService, pushEventManager } from '../../services';

// Capture the listeners the hook registers so tests can drive them.
let mockOnMessageCb: ((msg: any) => void) | undefined;
let mockOnReceiveCb: ((msg: any) => void) | undefined;

jest.mock('react-native', () => ({
    DeviceEventEmitter: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
    Platform: { OS: 'ios' },
}));

jest.mock('../../services', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    notificationService: {
        onMessage: jest.fn((cb: (msg: any) => void) => {
            mockOnMessageCb = cb;
            return jest.fn();
        }),
        onNotificationOpenedApp: jest.fn(() => jest.fn()),
        getInitialNotification: jest.fn(() => Promise.resolve(null)),
    },
    pushEventManager: {
        onReceiveNotification: jest.fn((cb: (msg: any) => void) => {
            mockOnReceiveCb = cb;
            return jest.fn();
        }),
        emitReceiveNotification: jest.fn(),
    },
}));

describe('useFcmHandler - 포그라운드 푸시 → OnReceiveNotification', () => {
    let bridge: { pushEvent: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessageCb = undefined;
        mockOnReceiveCb = undefined;
        bridge = { pushEvent: jest.fn() };
    });

    it('포그라운드 수신(onMessage)을 PushEventManager로 전달한다', () => {
        renderHook(() => useFcmHandler(bridge as any));
        const message = { notification: { title: 't', body: 'b' }, data: { id: '1' } };

        act(() => {
            mockOnMessageCb?.(message);
        });

        expect(pushEventManager.emitReceiveNotification).toHaveBeenCalledWith(message);
    });

    it('PushEventManager 수신 이벤트를 OnReceiveNotification 브릿지 이벤트로 발행한다', () => {
        renderHook(() => useFcmHandler(bridge as any));
        const message = { notification: { title: '제목', body: '본문' }, data: { id: '1' } };

        act(() => {
            mockOnReceiveCb?.(message);
        });

        expect(bridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnReceiveNotification',
            success: true,
            data: { notification: { title: '제목', body: '본문', data: { id: '1' } } },
        });
    });

    it('알림 탭 라우팅은 더 이상 구독하지 않는다 (useDeepLinkNavigation로 이관)', () => {
        renderHook(() => useFcmHandler(bridge as any));

        // Tap ownership moved out: the push hook must not register tap listeners anymore.
        expect(notificationService.onNotificationOpenedApp).not.toHaveBeenCalled();
        expect(notificationService.getInitialNotification).not.toHaveBeenCalled();
    });
});
