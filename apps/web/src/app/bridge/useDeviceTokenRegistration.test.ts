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
        delete window.CHATIC_APP_INSTALLATION_ID;
        delete window.CHATIC_APP_UNIQUE_DEVICE_ID;
        mockFetchFcmToken.mockResolvedValue({ data: { token: 'tok-123' } });
    });

    it('네이티브 셸 밖(플랫폼 없음)에서는 null 델리게이트를 넘긴다', () => {
        renderHook(() => useDeviceTokenRegistration());

        expect(mockRuntimeHook).toHaveBeenLastCalledWith(null);
    });

    it('앱 환경에서는 platform/installId/application을 담은 델리게이트를 넘긴다', () => {
        window.CHATIC_APP_PLATFORM = 'ios';
        window.CHATIC_APP_INSTALLATION_ID = 'inst-1';

        renderHook(() => useDeviceTokenRegistration());

        expect(lastDelegate()).toEqual(
            expect.objectContaining({
                platform: 'ios',
                installId: 'inst-1',
                application: 'chatic',
            })
        );
    });

    it('신규 앱에서는 UNIQUE_DEVICE_ID를 델리게이트 deviceId로 사용한다', () => {
        window.CHATIC_APP_PLATFORM = 'ios';
        window.CHATIC_APP_UNIQUE_DEVICE_ID = 'bare-device-1';
        window.CHATIC_APP_INSTALLATION_ID = 'bare-device-1';

        renderHook(() => useDeviceTokenRegistration());

        expect(lastDelegate()).toEqual(expect.objectContaining({ deviceId: 'bare-device-1' }));
    });

    it('구버전 앱(UNIQUE_DEVICE_ID 미주입)에서는 INSTALLATION_ID로 폴백한다', () => {
        window.CHATIC_APP_PLATFORM = 'android';
        window.CHATIC_APP_INSTALLATION_ID = 'legacy-device-1';

        renderHook(() => useDeviceTokenRegistration());

        expect(lastDelegate()).toEqual(expect.objectContaining({ deviceId: 'legacy-device-1' }));
    });

    it('두 글로벌 모두 없으면 deviceId를 넘기지 않는다 (런타임이 동적 id로 폴백)', () => {
        window.CHATIC_APP_PLATFORM = 'android';

        renderHook(() => useDeviceTokenRegistration());

        expect(lastDelegate().deviceId).toBeUndefined();
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
