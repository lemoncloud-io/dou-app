import { renderHook } from '@testing-library/react';

let mockDeviceToken: { fetch: () => Promise<string | null> } | null = null;

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
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

import { runtime } from '@chatic/runtime-react';
import { resetHostProfileForTests } from '@chatic/bridges';

import { appBridge } from './appBridge';
import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';

const mockRuntimeHook = runtime.push.useDeviceTokenRegistration as jest.Mock;
const mockFetch = jest.fn<Promise<string | null>, []>();

const lastDelegate = () => mockRuntimeHook.mock.calls[mockRuntimeHook.mock.calls.length - 1][0];

describe('useDeviceTokenRegistration, the delegate built from the push port', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete window.CHATIC_APP_PLATFORM;
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
        expect(lastDelegate().installId).toBeUndefined();
    });

    it("resolves the delegate's token from the port", async () => {
        window.CHATIC_APP_PLATFORM = 'android';

        renderHook(() => useDeviceTokenRegistration());

        await expect(lastDelegate().fetchDeviceToken()).resolves.toBe('tok-123');
        expect(mockFetch).toHaveBeenCalledTimes(1);
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
