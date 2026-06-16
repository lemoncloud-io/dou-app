import { useSessionDeviceId } from '@chatic/shared';

declare global {
    interface Window {
        CHATIC_APP_DEVICE_ID?: string;
    }
}

export const useDynamicDeviceId = () => {
    const { deviceId: sessionDeviceId } = useSessionDeviceId('chatic-device-id');
    const deviceId = window.CHATIC_APP_DEVICE_ID || sessionDeviceId;

    return { deviceId, isReady: true };
};
