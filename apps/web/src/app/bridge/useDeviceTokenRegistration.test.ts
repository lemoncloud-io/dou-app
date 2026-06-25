import { renderHook, waitFor } from '@testing-library/react';

jest.mock('@chatic/web-core', () => ({
    useSessionAuth: jest.fn(),
    useRegisterDeviceToken: jest.fn(),
}));

jest.mock('./appBridge', () => ({
    appBridge: {
        fetchFcmToken: jest.fn(),
    },
}));

import { useRegisterDeviceToken, useSessionAuth } from '@chatic/web-core';

import { appBridge } from './appBridge';
import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';

const mockUseSessionAuth = useSessionAuth as jest.Mock;
const mockUseRegister = useRegisterDeviceToken as jest.Mock;
const mockFetchFcmToken = appBridge.fetchFcmToken as jest.Mock;

const setAuthenticated = (isAuthenticated: boolean) => mockUseSessionAuth.mockReturnValue({ isAuthenticated });

describe('useDeviceTokenRegistration — 디바이스 토큰 등록', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete window.CHATIC_APP_PLATFORM;
        delete window.CHATIC_APP_INSTALLATION_ID;
        mockFetchFcmToken.mockResolvedValue({ data: { token: 'tok-123' } });
    });

    it('미인증 상태에서는 토큰을 가져오지 않고 null을 등록한다', () => {
        setAuthenticated(false);
        window.CHATIC_APP_PLATFORM = 'ios';

        renderHook(() => useDeviceTokenRegistration());

        expect(mockFetchFcmToken).not.toHaveBeenCalled();
        expect(mockUseRegister).toHaveBeenLastCalledWith(null);
    });

    it('네이티브 셸 밖(플랫폼 없음)에서는 토큰을 가져오지 않는다', () => {
        setAuthenticated(true); // authenticated but window.CHATIC_APP_PLATFORM is unset

        renderHook(() => useDeviceTokenRegistration());

        expect(mockFetchFcmToken).not.toHaveBeenCalled();
        expect(mockUseRegister).toHaveBeenLastCalledWith(null);
    });

    it('앱 환경에서는 FCM 토큰을 가져와 등록 body로 전달한다', async () => {
        setAuthenticated(true);
        window.CHATIC_APP_PLATFORM = 'ios';
        window.CHATIC_APP_INSTALLATION_ID = 'inst-1';

        renderHook(() => useDeviceTokenRegistration());

        expect(mockFetchFcmToken).toHaveBeenCalledTimes(1);
        await waitFor(() =>
            expect(mockUseRegister).toHaveBeenLastCalledWith({
                deviceToken: 'tok-123',
                platform: 'ios',
                installId: 'inst-1',
                application: 'chatic',
            })
        );
    });
});
