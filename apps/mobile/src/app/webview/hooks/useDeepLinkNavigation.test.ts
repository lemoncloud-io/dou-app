import { renderHook, act } from '@testing-library/react';

import { useDeepLinkNavigation } from './useDeepLinkNavigation';
import { deeplinkService } from '../../services';
import { navigationRef } from '../../features/core/navigation/navigationRef';

// Captured across the mocked services so tests can drive OS taps and deep link events.
let mockCapturedOnOpened: ((msg: any) => void) | undefined;
let mockCapturedSubscribe: ((url: string) => void) | undefined;
let mockGetInitialResult: any = null;
let mockGetInitialUrl: string | null = null;

jest.mock('../../features/core/navigation/navigationRef', () => ({
    navigationRef: { isReady: jest.fn(() => true), reset: jest.fn() },
}));

jest.mock('../../services', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    deeplinkService: {
        resolvePushTap: jest.fn(),
        resolveInbound: jest.fn(),
        getInitialUrl: jest.fn(() => Promise.resolve(mockGetInitialUrl)),
        subscribe: jest.fn((cb: (url: string) => void) => {
            mockCapturedSubscribe = cb;
            return jest.fn();
        }),
    },
    notificationService: {
        onNotificationOpenedApp: jest.fn((cb: (msg: any) => void) => {
            mockCapturedOnOpened = cb;
            return jest.fn();
        }),
        getInitialNotification: jest.fn(() => Promise.resolve(mockGetInitialResult)),
    },
}));

describe('useDeepLinkNavigation', () => {
    let bridge: { pushEvent: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        mockCapturedOnOpened = undefined;
        mockCapturedSubscribe = undefined;
        mockGetInitialResult = null;
        mockGetInitialUrl = null;
        bridge = { pushEvent: jest.fn() };
    });

    describe('알림 탭 → OnNavigate', () => {
        it('백그라운드 알림 탭을 resolvePushTap 결과 경로로 OnNavigate 발행한다', () => {
            (deeplinkService.resolvePushTap as jest.Mock).mockReturnValue('/channel?channelId=room_123&cid=cloud_1');
            renderHook(() => useDeepLinkNavigation(bridge as any));

            const data = { link: 'channel?channelId=room_123', payload: { cid: 'cloud_1' } };
            act(() => {
                mockCapturedOnOpened?.({ data });
            });

            expect(deeplinkService.resolvePushTap).toHaveBeenCalledWith(data);
            expect(bridge.pushEvent).toHaveBeenCalledWith({
                type: 'OnNavigate',
                success: true,
                data: { path: '/channel?channelId=room_123&cid=cloud_1', replace: false },
            });
        });

        it('resolvePushTap이 null이면 OnNavigate를 발행하지 않는다 (앱만 포그라운드)', () => {
            (deeplinkService.resolvePushTap as jest.Mock).mockReturnValue(null);
            renderHook(() => useDeepLinkNavigation(bridge as any));

            act(() => {
                mockCapturedOnOpened?.({ data: { payload: { cid: 'cloud_1' } } });
            });

            expect(bridge.pushEvent).not.toHaveBeenCalled();
        });

        it('콜드 스타트(getInitialNotification) 탭도 OnNavigate로 발행한다', async () => {
            mockGetInitialResult = { data: { link: '/channels/1000001/room' } };
            (deeplinkService.resolvePushTap as jest.Mock).mockReturnValue('/channels/1000001/room?cid=cloud_1');

            renderHook(() => useDeepLinkNavigation(bridge as any));

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

    describe('딥링크 → OnNavigate / navigationRef', () => {
        it('웜 딥링크(web)를 resolveInbound 후 OnNavigate로 발행한다', () => {
            (deeplinkService.resolveInbound as jest.Mock).mockReturnValue({ kind: 'web', path: '/channels/1' });
            renderHook(() => useDeepLinkNavigation(bridge as any));

            act(() => {
                mockCapturedSubscribe?.('chatic://channels/1');
            });

            expect(deeplinkService.resolveInbound).toHaveBeenCalledWith('chatic://channels/1');
            expect(bridge.pushEvent).toHaveBeenCalledWith({
                type: 'OnNavigate',
                success: true,
                data: { path: '/channels/1', replace: false },
            });
        });

        it('target=native 딥링크는 navigationRef.reset으로 적용하고 OnNavigate는 발행하지 않는다', () => {
            const state = { routes: [{ name: 'Debug', state: { routes: [{ name: 'DeeplinkTest' }] } }] };
            (deeplinkService.resolveInbound as jest.Mock).mockReturnValue({ kind: 'native', state });
            renderHook(() => useDeepLinkNavigation(bridge as any));

            act(() => {
                mockCapturedSubscribe?.('chatic://debug/DeeplinkTest?target=native');
            });

            expect(navigationRef.reset).toHaveBeenCalledWith(state);
            expect(bridge.pushEvent).not.toHaveBeenCalled();
        });

        it('invalid 딥링크는 deepLinkError를 세운다', () => {
            (deeplinkService.resolveInbound as jest.Mock).mockReturnValue({ kind: 'invalid', error: 'bad scheme' });
            const { result } = renderHook(() => useDeepLinkNavigation(bridge as any));

            act(() => {
                mockCapturedSubscribe?.('unsupported://xyz');
            });

            expect(result.current.deepLinkError).toBe(true);
            expect(result.current.deepLinkErrorReason).toBe('bad scheme');
            expect(bridge.pushEvent).not.toHaveBeenCalled();
        });
    });

    describe('콜드스타트 스플래시', () => {
        it('콜드스타트 web 딥링크는 isRedirecting을 켜고 handleWebViewLoad 후 해제한다', async () => {
            jest.useFakeTimers();
            mockGetInitialUrl = 'chatic://channels/1';
            (deeplinkService.resolveInbound as jest.Mock).mockReturnValue({ kind: 'web', path: '/channels/1' });

            const { result } = renderHook(() => useDeepLinkNavigation(bridge as any));

            // Flush getInitialUrl().then so the cold-start redirect is marked.
            await act(async () => {
                await Promise.resolve();
            });
            expect(result.current.isRedirecting).toBe(true);

            // WebView load + 300ms clears the splash.
            act(() => {
                result.current.handleWebViewLoad();
            });
            act(() => {
                jest.advanceTimersByTime(300);
            });
            expect(result.current.isRedirecting).toBe(false);

            jest.useRealTimers();
        });
    });

    it('bridge가 없으면 캡처를 등록하지 않는다', () => {
        renderHook(() => useDeepLinkNavigation(undefined));

        // Effect early-returns before subscribing when there is no bridge.
        expect(mockCapturedSubscribe).toBeUndefined();
        expect(mockCapturedOnOpened).toBeUndefined();
        expect(deeplinkService.getInitialUrl).not.toHaveBeenCalled();
    });
});
