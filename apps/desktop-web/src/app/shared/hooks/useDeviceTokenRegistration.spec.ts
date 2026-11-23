import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

const { register, fetchToken, onRenew, port } = vi.hoisted(() => ({
    register: vi.fn(),
    fetchToken: vi.fn(),
    onRenew: vi.fn(() => () => undefined),
    port: { inShell: true },
}));

vi.mock('@chatic/bridges', () => ({
    hostProfile: () => ({
        globals: { CHATIC_APP_PLATFORM: 'macos', CHATIC_APP_INSTALLATION_ID: 'install-1', CHATIC_APP_STAGE: 'prod' },
    }),
}));

vi.mock('@chatic/runtime', async () => {
    const { browserPush, fakeRuntimeModule } = await import('@chatic/runtime/testing');
    return fakeRuntimeModule({
        get push() {
            return {
                ...browserPush(),
                useDeviceTokenRegistration: register,
                deviceToken: port.inShell ? { fetch: fetchToken } : null,
                tokenRenewal: port.inShell ? { onRenew } : null,
            };
        },
    });
});

import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';

type Delegate = {
    fetchDeviceToken: () => Promise<string | null>;
    subscribeTokenChange?: (onChange: () => void) => () => void;
    platform: string;
    installId?: string;
    stage?: string;
};

const delegate = (): Delegate | null => register.mock.calls.at(-1)?.[0] ?? null;

beforeEach(() => {
    vi.clearAllMocks();
    port.inShell = true;
});

describe('useDeviceTokenRegistration (desktop)', () => {
    it('hands the runtime no delegate where the app holds no token', () => {
        port.inShell = false;

        renderHook(() => useDeviceTokenRegistration());

        expect(register).toHaveBeenCalledWith(null);
    });

    it("registers the app's token under the identity the shell injected", async () => {
        fetchToken.mockResolvedValueOnce('tok-1');

        renderHook(() => useDeviceTokenRegistration());

        expect(delegate()).toMatchObject({ platform: 'macos', installId: 'install-1', stage: 'prod' });
        await expect(delegate()?.fetchDeviceToken()).resolves.toBe('tok-1');
    });

    it('reads a failed token request as no token, for the runtime to retry', async () => {
        fetchToken.mockRejectedValueOnce(new Error('NATIVE_NOT_SUPPORTED'));

        renderHook(() => useDeviceTokenRegistration());

        await expect(delegate()?.fetchDeviceToken()).resolves.toBeNull();
    });

    it("passes the app's renewal announcements on as token changes", () => {
        renderHook(() => useDeviceTokenRegistration());
        const onChange = vi.fn();

        delegate()?.subscribeTokenChange?.(onChange);

        expect(onRenew).toHaveBeenCalledWith(onChange);
    });
});
