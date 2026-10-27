import { useMemo } from 'react';

/** The three kinds of device this site tells apart by user agent. */
export type DeviceType = 'ios' | 'android' | 'desktop';

export const useDeviceDetect = (): DeviceType => {
    return useMemo(() => {
        const userAgent = navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera;
        const isIOS =
            /iPad|iPhone|iPod/.test(userAgent || '') && !(window as unknown as { MSStream?: unknown }).MSStream;
        const isAndroid = /android/i.test(userAgent || '');

        if (isIOS) return 'ios';
        if (isAndroid) return 'android';
        return 'desktop';
    }, []);
};
