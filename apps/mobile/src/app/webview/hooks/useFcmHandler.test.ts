import { renderHook, act } from '@testing-library/react';

import { useFcmHandler } from './useFcmHandler';
import { notificationService, pushEventManager } from '../../services';

// Capture the listeners the hook registers so tests can drive them.
let mockOnMessageCb: ((msg: any) => void) | undefined;
let mockOnReceiveCb: ((msg: any) => void) | undefined;

let mockForegroundPushCb: ((event: any) => void) | undefined;

jest.mock('react-native', () => ({
    DeviceEventEmitter: {
        addListener: jest.fn((event: string, cb: (payload: any) => void) => {
            if (event === 'onForegroundPushReceived') mockForegroundPushCb = cb;
            return { remove: jest.fn() };
        }),
    },
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

const mockDrain = jest.fn();
jest.mock('../../bridge', () => ({ PushMarksBridge: { drain: () => mockDrain() } }));

describe('useFcmHandler - 포그라운드 푸시 → OnReceiveNotification', () => {
    let bridge: { pushEvent: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessageCb = undefined;
        mockOnReceiveCb = undefined;
        mockForegroundPushCb = undefined;
        bridge = { pushEvent: jest.fn() };
    });

    describe('handleFetchPushMarks', () => {
        it('네이티브 drain 결과를 OnFetchPushMarks 성공 응답으로 감싼다', async () => {
            mockDrain.mockResolvedValue([{ cid: 'cloud_1' }]);
            const { result } = renderHook(() => useFcmHandler(bridge as any));

            const response = await result.current.handleFetchPushMarks({} as any);

            expect(response).toEqual({
                type: 'OnFetchPushMarks',
                success: true,
                data: { marks: [{ cid: 'cloud_1' }] },
            });
        });

        it('drain이 실패하면 실패 응답을 반환한다', async () => {
            mockDrain.mockRejectedValue(new Error('native error'));
            const { result } = renderHook(() => useFcmHandler(bridge as any));

            const response = await result.current.handleFetchPushMarks({} as any);

            expect(response).toEqual({
                type: 'OnFetchPushMarks',
                success: false,
                error: { code: 'PUSH_MARKS_ERROR', message: 'native error' },
            });
        });
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

    describe('안드로이드 네이티브 포그라운드 이벤트 매핑', () => {
        // The native service resolves title/body/link itself but knows nothing about `ownerId` or
        // the chat channel — so it hands over the FCM payload as-is and this mapping must keep it.
        const emitNative = () =>
            act(() => {
                mockForegroundPushCb?.({
                    messageId: 'm1',
                    type: 'chat',
                    title: '제목',
                    body: '본문',
                    clickAction: 'chatic://channels/ch1/room',
                    // The OS notification channel, NOT the chat channel.
                    channelId: 'dou_chat',
                    timestamp: '1700000000000',
                    payload: JSON.stringify({ channelId: 'ch1', ownerId: 'u1', cid: 'c1' }),
                    data: { silent: 'false', channel_id: 'dou_chat', extra: 'kept' },
                });
            });

        it('FCM 데이터 전체와 payload 안의 필드를 모두 웹으로 넘긴다', () => {
            renderHook(() => useFcmHandler(bridge as any));

            emitNative();

            const [message] = (pushEventManager.emitReceiveNotification as jest.Mock).mock.calls[0];
            expect(message.data).toMatchObject({
                channelId: 'ch1',
                ownerId: 'u1',
                cid: 'c1',
                extra: 'kept',
                payload: JSON.stringify({ channelId: 'ch1', ownerId: 'u1', cid: 'c1' }),
            });
        });

        // Overwriting `channelId` with "dou_chat" matched no room route, so the web could never
        // tell it was already reading the room the push came from.
        it('OS 알림 채널을 chat channelId 자리에 덮어쓰지 않는다', () => {
            renderHook(() => useFcmHandler(bridge as any));

            emitNative();

            const [message] = (pushEventManager.emitReceiveNotification as jest.Mock).mock.calls[0];
            expect(message.data.channelId).toBe('ch1');
            expect(message.data.notificationChannelId).toBe('dou_chat');
        });
    });

    it('알림 탭 라우팅은 더 이상 구독하지 않는다 (useDeepLinkNavigation로 이관)', () => {
        renderHook(() => useFcmHandler(bridge as any));

        // Tap ownership moved out: the push hook must not register tap listeners anymore.
        expect(notificationService.onNotificationOpenedApp).not.toHaveBeenCalled();
        expect(notificationService.getInitialNotification).not.toHaveBeenCalled();
    });
});
