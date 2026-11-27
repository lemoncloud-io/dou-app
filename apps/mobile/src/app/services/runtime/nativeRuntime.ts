import '@chatic/runtime-mobile/polyfills';
import { Platform } from 'react-native';
import Config from 'react-native-config';
import DeviceInfo from 'react-native-device-info';

import { acquirePushToken } from '@chatic/push-mobile';
import { runNativeRuntime } from '@chatic/runtime-mobile';
import type { NativeRuntimeRunOptions } from '@chatic/runtime-mobile';

import { startMobileRuntime } from '../../../config/mobile';
import { getUserAgent } from '../../utils/device';
import { appRestart } from '../appRestart';
import { provider } from '../provider';
import { createNativeRuntimeHost } from './nativeRuntimeHost';
import { launchSessionOwner, launchSessionOwnerChoice } from './launchSessionOwner';
import { restartOnSessionEnd } from './restartOnSessionEnd';
import { runtimeHold } from './runtimeHold';
import { openRuntimeStorageFiles } from './runtimeStorageFiles';

const PUSH_RECORD_KEY = 'pushRegistration' as const;

const readEnv = (name: string): string | undefined => (Config as unknown as Record<string, string | undefined>)[name];

const createDeviceIds = (): NativeRuntimeRunOptions['deviceIds'] => {
    const deviceId = DeviceInfo.getUniqueIdSync();
    let firebaseInstallationId: string | undefined;
    void provider.firebaseInstallationService.getFirebaseId().then(id => {
        firebaseInstallationId = id ?? undefined;
    });
    return () => ({ deviceId, firebaseInstallationId });
};

const deviceIds = createDeviceIds();

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

export const nativeRuntimeHost = createNativeRuntimeHost({
    readOwner: launchSessionOwner,
    boot: async leaveToHome =>
        startMobileRuntime({
            vault: provider.secureStorageService,
            files: openRuntimeStorageFiles(),
            cache: {
                crud: () => provider.cacheCrudService,
                search: () => provider.cacheSearchService,
                logger: provider.logService,
            },
            env: readEnv,
            userAgent: await getUserAgent(),
            leaveToHome,
            owner: launchSessionOwnerChoice(),
            logger: provider.logService,
        }),
    run: engine => runNativeRuntime(engine, { deviceIds, push: pushDelegate }),
    onHoldChange: runtimeHold.set,
    logService: provider.logService,
});

restartOnSessionEnd(nativeRuntimeHost, appRestart);
