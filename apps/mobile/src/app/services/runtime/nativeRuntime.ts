// First: the runtime's random source, before anything below draws on it. This module is loaded only
// when the runtime is wanted, so the app's startup never pays for it.
import '@chatic/runtime-mobile/polyfills';
import { Platform } from 'react-native';
import Config from 'react-native-config';
import DeviceInfo from 'react-native-device-info';

import { bootNativeRuntime, runNativeRuntime } from '@chatic/runtime-mobile';
import type { NativeRuntimeRunOptions } from '@chatic/runtime-mobile';

import { getUserAgent } from '../../utils/device';
import { acquirePushToken } from '../notification/pushToken';
import { provider } from '../provider';
import { createNativeRuntimeHost } from './nativeRuntimeHost';
import { buildRuntimePorts } from './runtimePorts';
import { launchSessionOwner } from './launchSessionOwner';
import { openRuntimeStorageFiles } from './runtimeStorageFiles';

/** The preference the page keeps its push registration record under; the runtime keeps the same one. */
const PUSH_RECORD_KEY = 'pushRegistration' as const;

/** The build's values by name — react-native-config's `Config`, read as plain strings. */
const readEnv = (name: string): string | undefined => (Config as unknown as Record<string, string | undefined>)[name];

/**
 * The device's ids, as the app injects them into its pages (`CHATIC_APP_UNIQUE_DEVICE_ID`,
 * `CHATIC_APP_FIREBASE_INSTALLATION_ID`), so the server sees one device whichever side holds the
 * session. The Firebase id resolves asynchronously and joins once it has.
 */
const createDeviceIds = (): NativeRuntimeRunOptions['deviceIds'] => {
    const deviceId = DeviceInfo.getUniqueIdSync();
    let firebaseInstallationId: string | undefined;
    void provider.firebaseInstallationService.getFirebaseId().then(id => {
        firebaseInstallationId = id ?? undefined;
    });
    return () => ({ deviceId, firebaseInstallationId });
};

// Asked for as this module loads — before the boot, not after it — so the Firebase id is in hand by
// the time push registration first runs; the registration record is not re-sent when it arrives later.
const deviceIds = createDeviceIds();

/** How the runtime reaches this device's push token: the way the page asks for it, without the bridge. */
const pushDelegate: NonNullable<NativeRuntimeRunOptions['push']> = {
    fetchDeviceToken: () => acquirePushToken(provider.notificationService, Platform.OS).catch(() => null),
    platform: Platform.OS,
    application: 'chatic',
    nativeRecordMirror: {
        read: async () => {
            const value = await provider.preferenceService.get<string>(PUSH_RECORD_KEY).catch(() => null);
            return typeof value === 'string' ? value : null;
        },
        write: raw => provider.preferenceService.set(PUSH_RECORD_KEY, raw),
    },
};

/**
 * The app's runtime host — the one per process. It owns the session only on a launch whose owner is
 * `native` (`launchSessionOwner`); on every other launch `start` answers `null` and touches nothing.
 *
 * This module loads the whole runtime, so nothing on the app's startup path imports it: whatever
 * starts the runtime loads it when it is needed (`require`), and a launch the page owns never does.
 */
export const nativeRuntimeHost = createNativeRuntimeHost({
    readOwner: launchSessionOwner,
    boot: async leaveToHome => {
        const ports = buildRuntimePorts({
            vault: provider.secureStorageService,
            files: openRuntimeStorageFiles(),
            cache: {
                crud: () => provider.cacheCrudService,
                search: () => provider.cacheSearchService,
                logger: provider.logService,
            },
        });
        return bootNativeRuntime({
            ...ports,
            vault: provider.secureStorageService,
            env: readEnv,
            userAgent: await getUserAgent(),
            leaveToHome,
        });
    },
    run: engine => runNativeRuntime(engine, { deviceIds, push: pushDelegate }),
    logService: provider.logService,
});
