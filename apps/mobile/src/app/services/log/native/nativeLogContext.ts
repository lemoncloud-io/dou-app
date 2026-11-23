import { createLogId, setLogContextProvider } from '@chatic/logger';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';

import type { LogContext } from '@chatic/logger';

export const NATIVE_RUN_ID = createLogId();

const DEVICE = {
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined,
    host: 'app',
    os: Platform.OS.toLowerCase(),
    osVersion: DeviceInfo.getSystemVersion(),
    model: DeviceInfo.getDeviceId() || undefined,
    appVersion: DeviceInfo.getVersion(),
};

let readSessionOwner: (() => string) | null = null;

export const setLogSessionOwnerSource = (source: (() => string) | null): void => {
    readSessionOwner = source;
};

const sessionOwner = (): string | undefined => {
    try {
        return readSessionOwner?.() ?? undefined;
    } catch {
        return undefined;
    }
};

export const readNativeLogContext = (): LogContext => ({
    runId: NATIVE_RUN_ID,
    ...DEVICE,
    sessionOwner: sessionOwner(),
});

export const attachNativeLogContext = (): void => {
    setLogContextProvider(readNativeLogContext);
};
