import { renderHook } from '@testing-library/react';

// The push port's token member as each test plays it: `null` is a browser's port, which has none.
let mockDeviceToken: { fetch: () => Promise<string | null> } | null = null;

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        push: {
            useDeviceTokenRegistration: jest.fn(),
            get deviceToken() {
                return mockDeviceToken;
            },
        },
    })
);

jest.mock('./appBridge', () => ({
    appBridge: {
        fetchFcmToken: jest.fn(),
    },
}));

import { runtime } from '@chatic/runtime';
import { resetHostProfileForTests } from '@chatic/bridges';

import { appBridge } from './appBridge';
import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';

const mockRuntimeHook = runtime.push.useDeviceTokenRegistration as jest.Mock;
const mockFetch = jest.fn<Promise<string | null>, []>();

// The adapter's job is delegate construction only; registration policy is
// covered by the runtime's own tests.
const lastDelegate = () => mockRuntimeHook.mock.calls[mockRuntimeHook.mock.calls.length - 1][0];

describe('useDeviceTokenRegistration, the delegate built from the push port', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete window.CHATIC_APP_PLATFORM;
        // Each test plays a shell that injects its platform before the page boots: the host profile
        // is built from `window` at the first read, which is the render below.
        resetHostProfileForTests();
        mockDeviceToken = { fetch: mockFetch };
        mockFetch.mockResolvedValue('tok-123');
    });

    it('hands over no delegate where the port has no device token', () => {
        window.CHATIC_APP_PLATFORM = 'ios';
        mockDeviceToken = null;

        renderHook(() => useDeviceTokenRegistration());

        expect(mockRuntimeHook).toHaveBeenLastCalledWith(null);
    });

    it('hands over no delegate where the shell injected no platform', () => {
        renderHook(() => useDeviceTokenRegistration());

        expect(mockRuntimeHook).toHaveBeenLastCalledWith(null);
    });

    it('hands over a delegate with the platform and application in the app', () => {
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

    it("resolves the delegate's token from the port", async () => {
        window.CHATIC_APP_PLATFORM = 'android';

        renderHook(() => useDeviceTokenRegistration());

        await expect(lastDelegate().fetchDeviceToken()).resolves.toBe('tok-123');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        // The bridge is the port's business, not this adapter's.
        expect(appBridge.fetchFcmToken).not.toHaveBeenCalled();
    });

    it('resolves null when the port has no token', async () => {
        window.CHATIC_APP_PLATFORM = 'android';
        mockFetch.mockResolvedValue(null);

        renderHook(() => useDeviceTokenRegistration());

        await expect(lastDelegate().fetchDeviceToken()).resolves.toBeNull();
    });

    it('resolves null when the token request fails, leaving the retry to the runtime', async () => {
        window.CHATIC_APP_PLATFORM = 'android';
        mockFetch.mockRejectedValue(new Error('permission denied'));

        renderHook(() => useDeviceTokenRegistration());

        await expect(lastDelegate().fetchDeviceToken()).resolves.toBeNull();
    });
});
