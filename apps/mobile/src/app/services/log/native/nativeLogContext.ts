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
 * That is expected, and the server hoists whatever arrives. `sessionOwner` says
 * which side holds the session this launch, from the source the provider sets.
 */

/** Issued once per process — the identity of this app run. */
export const NATIVE_RUN_ID = createLogId();

const DEVICE = {
    // The device family and the host, the same two values the WebView stamps inside this app.
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined,
    host: 'app',
    os: Platform.OS.toLowerCase(),
    osVersion: DeviceInfo.getSystemVersion(),
    model: DeviceInfo.getDeviceId() || undefined,
    appVersion: DeviceInfo.getVersion(),
};

let readSessionOwner: (() => string) | null = null;

/**
 * Where entries read which side holds the session this launch from (`launchSessionOwner`). Set by
 * the provider; a source that throws leaves the field off rather than taking logging down.
 */
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
    // Which side holds the session this launch — settled once, so every entry of a run agrees.
    sessionOwner: sessionOwner(),
});

/** Registers the provider with the logging core. Call before anything logs. */
export const attachNativeLogContext = (): void => {
    setLogContextProvider(readNativeLogContext);
};
