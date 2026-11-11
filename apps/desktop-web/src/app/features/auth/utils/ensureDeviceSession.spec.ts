import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMock = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: { getIdentityContext: () => ({ isAuthenticated: runtimeMock.isAuthenticated }) },
    },
}));

import { ensureDeviceSession } from './ensureDeviceSession';

describe('ensureDeviceSession', () => {
    const register = vi.fn();

    beforeEach(() => {
        runtimeMock.isAuthenticated = false;
        register.mockReset().mockResolvedValue(undefined);
    });

    it('registers the device when there is no session', async () => {
        await ensureDeviceSession(register);

        expect(register).toHaveBeenCalledTimes(1);
    });

    it('does nothing when a session already exists', async () => {
        runtimeMock.isAuthenticated = true;

        await ensureDeviceSession(register);

        expect(register).not.toHaveBeenCalled();
    });

    it('rejects when the registration fails, so the caller can stop', async () => {
        register.mockRejectedValue(new Error('offline'));

        await expect(ensureDeviceSession(register)).rejects.toThrow('offline');
    });
});
