import { renderHook } from '@testing-library/react';

const mockRefreshRelaySession = jest.fn();
const mockRefreshActiveCloudSession = jest.fn();
const mockLoadRelayProfile = jest.fn();
const mockTryLoadRelayProfile = jest.fn();
const mockReportError = jest.fn();
const mockClassifyError = jest.fn();
const mockToError = jest.fn((e: unknown) => e);
const mockLogout = jest.fn();
const mockUseSessionAuth = jest.fn();
const mockUseSessionIdentity = jest.fn();

jest.mock('../../session', () => ({
    refreshRelaySession: (...args: unknown[]) => mockRefreshRelaySession(...args),
    refreshActiveCloudSession: (...args: unknown[]) => mockRefreshActiveCloudSession(...args),
    loadRelayProfile: (...args: unknown[]) => mockLoadRelayProfile(...args),
    tryLoadRelayProfile: (...args: unknown[]) => mockTryLoadRelayProfile(...args),
}));

jest.mock('../../api', () => ({
    reportError: (...args: unknown[]) => mockReportError(...args),
}));

jest.mock('../../transport/error', () => ({
    classifyError: (...args: unknown[]) => mockClassifyError(...args),
    toError: (...args: unknown[]) => mockToError(...args),
}));

jest.mock('../session', () => ({
    useSessionLogout: () => mockLogout,
}));

jest.mock('../session/readers/useSessionAuth', () => ({
    useSessionAuth: () => mockUseSessionAuth(),
}));

jest.mock('../session/readers/useSessionIdentity', () => ({
    useSessionIdentity: () => mockUseSessionIdentity(),
}));

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { useTokenRefresh } = require('./useTokenRefresh');

describe('useTokenRefresh — parallel cloud refresh', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // isAuthenticated:false → skip the mount initialize effect so we can drive refreshToken directly
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });
        mockUseSessionIdentity.mockReturnValue({ relayProfile: null, isInvited: false });
        mockRefreshRelaySession.mockResolvedValue(null);
        mockRefreshActiveCloudSession.mockResolvedValue(undefined);
        mockClassifyError.mockReturnValue({ shouldLogout: false });
    });

    it('refreshes relay and the active cloud session in parallel', async () => {
        const { result } = renderHook(() => useTokenRefresh(true));

        await result.current.refreshToken();

        expect(mockRefreshRelaySession).toHaveBeenCalledWith({ syncProfile: false });
        expect(mockRefreshActiveCloudSession).toHaveBeenCalledTimes(1);
    });

    it('does not log out when only the cloud refresh fails', async () => {
        mockRefreshActiveCloudSession.mockRejectedValue(new Error('cloud refresh failed'));

        const { result } = renderHook(() => useTokenRefresh(true));

        const ok = await result.current.refreshToken();

        expect(ok).toBe(true);
        expect(mockLogout).not.toHaveBeenCalled();
    });

    it('logs out when relay refresh fails with a shouldLogout error', async () => {
        mockRefreshRelaySession.mockRejectedValue(new Error('invalid token'));
        mockClassifyError.mockReturnValue({ shouldLogout: true });

        const { result } = renderHook(() => useTokenRefresh(true));

        const ok = await result.current.refreshToken();

        expect(ok).toBe(false);
        expect(mockLogout).toHaveBeenCalledTimes(1);
    });
});
