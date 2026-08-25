import { createLogId, setLogContextProvider } from '@chatic/logger';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';

import type { LogContext } from '@chatic/logger';

/**
 * The native shell's occurrence-time context.
 *
 * `runId` is issued here, once, because this module is loaded at app start and
 * the value has to identify exactly one app run — it is the axis that groups a
 * launch, which sid/uid/cid cannot do since they are all tenancy axes. The same
 * value is injected into the WebView so native and web entries from one launch
 * carry the same id.
 *
 * The tenancy fields stay empty on this side: only the web session knows them.
 * That is expected, and the server hoists whatever arrives.
 */

/** Issued once per process — the identity of this app run. */
export const NATIVE_RUN_ID = createLogId();

const DEVICE = {
    os: Platform.OS.toLowerCase(),
    osVersion: DeviceInfo.getSystemVersion(),
    model: DeviceInfo.getDeviceId() || undefined,
    appVersion: DeviceInfo.getVersion(),
};

export const readNativeLogContext = (): LogContext => ({
    runId: NATIVE_RUN_ID,
    ...DEVICE,
});

/** Registers the provider with the logging core. Call before anything logs. */
export const attachNativeLogContext = (): void => {
    setLogContextProvider(readNativeLogContext);
};
