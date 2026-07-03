import { renderHook, act } from '@testing-library/react';

// Captured across the mocked service so a test can simulate an OS notification tap.
let mockCapturedOnOpened: ((msg: any) => void) | undefined;
let mockGetInitialResult: any = null;

jest.mock('react-native', () => ({
    DeviceEventEmitter: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
    Platform: { OS: 'ios' },
}));

jest.mock('../../services', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    notificationService: {
        onMessage: jest.fn(() => jest.fn()),
        onNotificationOpenedApp: jest.fn((cb: (msg: any) => void) => {
            mockCapturedOnOpened = cb;
            return jest.fn();
        }),
        getInitialNotification: jest.fn(() => Promise.resolve(mockGetInitialResult)),
    },
    pushEventManager: {
        onReceiveNotification: jest.fn(() => jest.fn()),
        emitReceiveNotification: jest.fn(),
    },
}));

import { useFcmHandler } from './useFcmHandler';

describe('useFcmHandler - 알림 탭 → OnNavigate 라우팅', () => {
    let bridge: { pushEvent: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        mockCapturedOnOpened = undefined;
        mockGetInitialResult = null;
        bridge = { pushEvent: jest.fn() };
    });

    it('백그라운드 알림 탭 시 link와 payload의 cid/sid를 합쳐 OnNavigate 이벤트로 직접 발행한다', () => {
        renderHook(() => useFcmHandler(bridge as any));

        // Simulate an OS notification tap carrying spec-shaped data (link + payload with cid/sid).
        act(() => {
            mockCapturedOnOpened?.({
                data: {
                    link: 'channel?channelId=room_123',
                    payload: JSON.stringify({ cid: 'cloud_1', sid: '100002' }),
                },
            });
        });

        expect(bridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnNavigate',
            success: true,
            data: { path: '/channel?channelId=room_123&cid=cloud_1&sid=100002', replace: false },
        });
    });

    it('link이 없는 알림 탭은 OnNavigate를 발행하지 않는다 (앱만 포그라운드)', () => {
        renderHook(() => useFcmHandler(bridge as any));

        act(() => {
            mockCapturedOnOpened?.({ data: { payload: JSON.stringify({ cid: 'cloud_1' }) } });
        });

        expect(bridge.pushEvent).not.toHaveBeenCalled();
    });

    it('콜드 스타트(getInitialNotification) 탭도 동일하게 OnNavigate로 발행한다', async () => {
        mockGetInitialResult = {
            data: { link: '/channels/1000001/room', payload: { cid: 'cloud_1' } },
        };

        renderHook(() => useFcmHandler(bridge as any));

        // Flush the getInitialNotification().then microtask.
        await act(async () => {
            await Promise.resolve();
        });

        expect(bridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnNavigate',
            success: true,
            data: { path: '/channels/1000001/room?cid=cloud_1', replace: false },
        });
    });
});
