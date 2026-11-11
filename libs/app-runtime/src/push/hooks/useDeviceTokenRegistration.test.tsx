import { renderHook } from '@testing-library/react';

import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';
import type { DeviceTokenDelegate } from './useDeviceTokenRegistration';

const mockStop = jest.fn();
const mockStart = jest.fn(() => mockStop);
const mockNotifyForeground = jest.fn();
let mockOptions: { delegate: () => DeviceTokenDelegate | null; deviceIds: () => unknown } | null = null;
jest.mock('@chatic/runtime-core/push/pushRegistration', () => ({
    PushRegistration: jest.fn().mockImplementation(options => {
        mockOptions = options;
        return { start: mockStart, notifyForeground: mockNotifyForeground };
    }),
}));
jest.mock('../../session', () => ({
    useDynamicDeviceId: () => ({ deviceId: 'device-1', firebaseInstallationId: 'fid-1', isReady: true }),
}));

const delegate = (platform = 'ios'): DeviceTokenDelegate => ({ fetchDeviceToken: async () => 'tok', platform });

beforeEach(() => {
    jest.clearAllMocks();
    mockOptions = null;
});

describe('useDeviceTokenRegistration', () => {
    it('starts nothing without a delegate', () => {
        renderHook(() => useDeviceTokenRegistration(null));

        expect(mockStart).not.toHaveBeenCalled();
    });

    it('starts the registration with a delegate, and stops it on unmount', () => {
        const { unmount } = renderHook(() => useDeviceTokenRegistration(delegate()));
        expect(mockStart).toHaveBeenCalledTimes(1);

        unmount();
        expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('hands the registration the latest delegate and the device ids, without restarting it', () => {
        const { rerender } = renderHook(({ platform }) => useDeviceTokenRegistration(delegate(platform)), {
            initialProps: { platform: 'ios' },
        });

        rerender({ platform: 'android' });

        expect(mockStart).toHaveBeenCalledTimes(1);
        expect(mockOptions?.delegate()?.platform).toBe('android');
        expect(mockOptions?.deviceIds()).toMatchObject({ deviceId: 'device-1', firebaseInstallationId: 'fid-1' });
    });

    it('passes a window focus on to the registration', () => {
        renderHook(() => useDeviceTokenRegistration(delegate()));

        window.dispatchEvent(new Event('focus'));

        expect(mockNotifyForeground).toHaveBeenCalledTimes(1);
    });
});
