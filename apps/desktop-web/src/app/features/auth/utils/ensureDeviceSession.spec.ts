import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMock = vi.hoisted(() => ({
    isAuthenticated: false,
    startWebTransportInit: vi.fn(),
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: { startWebTransportInit: runtimeMock.startWebTransportInit },
        session: { getIdentityContext: () => ({ isAuthenticated: runtimeMock.isAuthenticated }) },
    },
}));

import { ensureDeviceSession } from './ensureDeviceSession';

describe('ensureDeviceSession', () => {
    const register = vi.fn();

    beforeEach(() => {
        runtimeMock.isAuthenticated = false;
        runtimeMock.startWebTransportInit.mockReset().mockResolvedValue(undefined);
        register.mockReset().mockResolvedValue(undefined);
    });

    it('starts the transport, then registers the device, when there is no session', async () => {
        const order: string[] = [];
        runtimeMock.startWebTransportInit.mockImplementation(async () => void order.push('init'));
        register.mockImplementation(async () => void order.push('register'));

        await ensureDeviceSession(register);

        expect(order).toEqual(['init', 'register']);
    });

    it('does nothing when a session already exists', async () => {
        runtimeMock.isAuthenticated = true;

        await ensureDeviceSession(register);

        expect(runtimeMock.startWebTransportInit).not.toHaveBeenCalled();
        expect(register).not.toHaveBeenCalled();
    });

    it('rejects when the registration fails, so the caller can stop', async () => {
        register.mockRejectedValue(new Error('offline'));

        await expect(ensureDeviceSession(register)).rejects.toThrow('offline');
    });

    it('does not register when the transport fails to start', async () => {
        runtimeMock.startWebTransportInit.mockRejectedValue(new Error('no transport'));

        await expect(ensureDeviceSession(register)).rejects.toThrow('no transport');
        expect(register).not.toHaveBeenCalled();
    });
});
