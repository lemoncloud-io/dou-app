import { act, renderHook, waitFor } from '@testing-library/react';

const mockLoginRelayGuestByDevice = jest.fn();
const mockUseSessionAuth = jest.fn();
const mockUseDynamicDeviceId = jest.fn();

jest.mock('../../auth/relaySession', () => ({
    relaySession: { loginGuestByDevice: (...args: unknown[]) => mockLoginRelayGuestByDevice(...args) },
}));

jest.mock('../session', () => ({
    useSessionAuth: () => mockUseSessionAuth(),
}));

jest.mock('./useDynamicDeviceId', () => ({
    useDynamicDeviceId: () => mockUseDynamicDeviceId(),
}));

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { useRelaySessionKeepAlive } = require('./useRelaySessionKeepAlive');

const setOnline = (online: boolean): void => {
    Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
};

describe('useRelaySessionKeepAlive', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
        setOnline(true);
        mockLoginRelayGuestByDevice.mockResolvedValue(undefined);
        mockUseDynamicDeviceId.mockReturnValue({ deviceId: 'device-1', isReady: true });
    });

    afterEach(() => setOnline(true));

    it('performs a background guest login when relay session is absent', async () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });

        renderHook(() => useRelaySessionKeepAlive(true));

        await waitFor(() => expect(mockLoginRelayGuestByDevice).toHaveBeenCalledWith('device-1'));
        expect(mockLoginRelayGuestByDevice).toHaveBeenCalledTimes(1);
    });

    it('does not log in when already authenticated', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });

        renderHook(() => useRelaySessionKeepAlive(true));

        expect(mockLoginRelayGuestByDevice).not.toHaveBeenCalled();
    });

    it('does not log in when deviceId is not ready', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });
        mockUseDynamicDeviceId.mockReturnValue({ deviceId: undefined, isReady: false });

        renderHook(() => useRelaySessionKeepAlive(true));

        expect(mockLoginRelayGuestByDevice).not.toHaveBeenCalled();
    });

    it('does not log in when disabled', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });

        renderHook(() => useRelaySessionKeepAlive(false));

        expect(mockLoginRelayGuestByDevice).not.toHaveBeenCalled();
    });

    // A first launch with no network used to burn its single attempt and then sit sessionless until
    // the app restarted: nothing in the effect's dependencies moves when a login fails.
    it('skips the attempt while offline, then runs it when the network returns', async () => {
        setOnline(false);
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });

        renderHook(() => useRelaySessionKeepAlive(true));
        expect(mockLoginRelayGuestByDevice).not.toHaveBeenCalled();

        setOnline(true);
        act(() => {
            window.dispatchEvent(new Event('online'));
        });

        await waitFor(() => expect(mockLoginRelayGuestByDevice).toHaveBeenCalledWith('device-1'));
    });

    it('retries a FAILED attempt on the foreground edge', async () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });
        mockLoginRelayGuestByDevice.mockRejectedValue(new Error('offline-ish'));

        renderHook(() => useRelaySessionKeepAlive(true));
        await waitFor(() => expect(mockLoginRelayGuestByDevice).toHaveBeenCalledTimes(1));

        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        await waitFor(() => expect(mockLoginRelayGuestByDevice).toHaveBeenCalledTimes(2));
    });

    it('floors the edge retries so a bouncing app cannot storm the login', async () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });
        mockLoginRelayGuestByDevice.mockRejectedValue(new Error('offline-ish'));

        renderHook(() => useRelaySessionKeepAlive(true));
        await waitFor(() => expect(mockLoginRelayGuestByDevice).toHaveBeenCalledTimes(1));

        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
            document.dispatchEvent(new Event('visibilitychange'));
            document.dispatchEvent(new Event('visibilitychange'));
        });

        await waitFor(() => expect(mockLoginRelayGuestByDevice).toHaveBeenCalledTimes(2));
        expect(mockLoginRelayGuestByDevice).toHaveBeenCalledTimes(2);
    });

    it('stops listening for edges once the session is there', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });

        renderHook(() => useRelaySessionKeepAlive(true));

        act(() => {
            window.dispatchEvent(new Event('online'));
        });

        expect(mockLoginRelayGuestByDevice).not.toHaveBeenCalled();
    });
});
