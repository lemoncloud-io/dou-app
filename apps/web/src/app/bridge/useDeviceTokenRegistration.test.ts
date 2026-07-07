import { renderHook } from '@testing-library/react';

jest.mock('@chatic/app-runtime', () => ({
    useDeviceTokenRegistration: jest.fn(),
}));

jest.mock('./appBridge', () => ({
    appBridge: {
        fetchFcmToken: jest.fn(),
    },
}));

import { useDeviceTokenRegistration as useRuntimeDeviceTokenRegistration } from '@chatic/app-runtime';

import { appBridge } from './appBridge';
import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';

const mockRuntimeHook = useRuntimeDeviceTokenRegistration as jest.Mock;
const mockFetchFcmToken = appBridge.fetchFcmToken as jest.Mock;

// The adapter's job is delegate construction only; registration policy is
// covered by app-runtime's own tests.
const lastDelegate = () => mockRuntimeHook.mock.calls[mockRuntimeHook.mock.calls.length - 1][0];

describe('useDeviceTokenRegistration — appBridge 델리게이트 어댑터', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete window.CHATIC_APP_PLATFORM;
        mockFetchFcmToken.mockResolvedValue({ data: { token: 'tok-123' } });
    });

    it('네이티브 셸 밖(플랫폼 없음)에서는 null 델리게이트를 넘긴다', () => {
        renderHook(() => useDeviceTokenRegistration());

        expect(mockRuntimeHook).toHaveBeenLastCalledWith(null);
    });

    it('앱 환경에서는 platform/application을 담은 델리게이트를 넘긴다', () => {
        window.CHATIC_APP_PLATFORM = 'ios';

        renderHook(() => useDeviceTokenRegistration());

        expect(lastDelegate()).toEqual(
            expect.objectContaining({
                platform: 'ios',
                application: 'chatic',
            })
        );
        // Device identity (deviceId / installId) is resolved inside the runtime
        // via useDynamicDeviceId — the adapter must not supply its own.
        expect(lastDelegate().installId).toBeUndefined();
    });

    it('델리게이트의 fetchDeviceToken은 브리지 응답의 토큰을 반환한다', async () => {
        window.CHATIC_APP_PLATFORM = 'android';

        renderHook(() => useDeviceTokenRegistration());

        await expect(lastDelegate().fetchDeviceToken()).resolves.toBe('tok-123');
        expect(mockFetchFcmToken).toHaveBeenCalledTimes(1);
    });

    it('브리지 응답에 토큰이 없으면 null을 반환한다', async () => {
        window.CHATIC_APP_PLATFORM = 'android';
        mockFetchFcmToken.mockResolvedValue({ data: {} });

        renderHook(() => useDeviceTokenRegistration());

        await expect(lastDelegate().fetchDeviceToken()).resolves.toBeNull();
    });

    it('브리지 호출이 실패하면 null을 반환한다 (런타임이 재시도)', async () => {
        window.CHATIC_APP_PLATFORM = 'android';
        mockFetchFcmToken.mockRejectedValue(new Error('permission denied'));

        renderHook(() => useDeviceTokenRegistration());

        await expect(lastDelegate().fetchDeviceToken()).resolves.toBeNull();
    });
});
