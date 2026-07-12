import { renderHook, waitFor } from '@testing-library/react';

const mockRefreshRelaySession = jest.fn();
const mockRefreshActiveCloudSession = jest.fn();
const mockReportError = jest.fn();
const mockClassifyError = jest.fn();
const mockToError = jest.fn((e: unknown) => e);
const mockLogout = jest.fn();
const mockUseSessionAuth = jest.fn();

jest.mock('../../session', () => ({
    refreshRelaySession: (...args: unknown[]) => mockRefreshRelaySession(...args),
    refreshActiveCloudSession: (...args: unknown[]) => mockRefreshActiveCloudSession(...args),
}));

jest.mock('../../api', () => ({
    reportError: (...args: unknown[]) => mockReportError(...args),
}));

jest.mock('../../transport/error', () => ({
    classifyError: (...args: unknown[]) => mockClassifyError(...args),
    toError: (...args: unknown[]) => mockToError(...args),
}));

// useTokenRefresh imports both useSessionAuth and useSessionLogout from the `../session` barrel.
jest.mock('../session', () => ({
    useSessionAuth: () => mockUseSessionAuth(),
    useSessionLogout: () => mockLogout,
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
        mockRefreshRelaySession.mockResolvedValue(null);
        mockRefreshActiveCloudSession.mockResolvedValue(undefined);
        mockClassifyError.mockReturnValue({ shouldLogout: false });
    });

    it('refreshes relay and the active cloud session in parallel', async () => {
        const { result } = renderHook(() => useTokenRefresh(true));

        await result.current.refreshToken();

        expect(mockRefreshRelaySession).toHaveBeenCalledWith({ syncProfile: true });
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

describe('useTokenRefresh — sdkOwnsRefresh (single flag)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Authenticated so the mount effect runs initialize(); a boot refresh WOULD fire if not skipped.
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });
        mockRefreshRelaySession.mockResolvedValue(null);
        mockRefreshActiveCloudSession.mockResolvedValue(undefined);
        mockClassifyError.mockReturnValue({ shouldLogout: false });
    });

    it('does NO HTTP refresh (neither boot nor periodic) but still marks initialized when sdkOwnsRefresh is true', async () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        const { result } = renderHook(() => useTokenRefresh(true, { sdkOwnsRefresh: true }));

        await waitFor(() => expect(result.current.initStatus).toBe('success'));
        await Promise.resolve(); // flush the .then(startInterval) microtask

        // No boot HTTP refresh → no double-rotation, no shouldLogout path, no logout.
        expect(mockRefreshRelaySession).not.toHaveBeenCalled();
        expect(mockRefreshActiveCloudSession).not.toHaveBeenCalled();
        expect(mockLogout).not.toHaveBeenCalled();
        // …and no periodic interval armed. The hook's interval uses 60_000ms; assert on that specifically
        // so waitFor's own internal 50ms polling does not register as a false positive.
        expect(setIntervalSpy).not.toHaveBeenCalledWith(expect.any(Function), 60_000);

        setIntervalSpy.mockRestore();
    });

    it('runs the boot refresh AND arms the periodic interval when sdkOwnsRefresh is not set (admin/desktop path)', async () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        const { result } = renderHook(() => useTokenRefresh(true));

        await waitFor(() => expect(result.current.initStatus).toBe('success'));
        expect(mockRefreshRelaySession).toHaveBeenCalledWith({ syncProfile: true });
        await waitFor(() => expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000));

        setIntervalSpy.mockRestore();
    });
});
