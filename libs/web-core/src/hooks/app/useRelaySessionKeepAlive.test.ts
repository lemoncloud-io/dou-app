import { renderHook, waitFor } from '@testing-library/react';

const mockLoginRelayGuestByDevice = jest.fn();
const mockUseSessionAuth = jest.fn();
const mockUseDynamicDeviceId = jest.fn();

jest.mock('../../session', () => ({
    loginRelayGuestByDevice: (...args: unknown[]) => mockLoginRelayGuestByDevice(...args),
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

describe('useRelaySessionKeepAlive', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLoginRelayGuestByDevice.mockResolvedValue(undefined);
        mockUseDynamicDeviceId.mockReturnValue({ deviceId: 'device-1', isReady: true });
    });

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
});
