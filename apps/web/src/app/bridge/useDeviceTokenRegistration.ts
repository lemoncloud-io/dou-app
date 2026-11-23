import { useMemo } from 'react';

import { runtime } from '@chatic/runtime';
import { hostProfile } from '@chatic/bridges';

import { appBridge } from './appBridge';

const APPLICATION = 'chatic';
const RECORD_PREFERENCE_KEY = 'pushRegistration' as const;

const nativeRecordMirror: runtime.push.DeviceTokenDelegate['nativeRecordMirror'] = {
    read: () =>
        appBridge
            .fetchPreference({ key: RECORD_PREFERENCE_KEY })
            .then(response => {
                const value = response.data?.value;
                return typeof value === 'string' ? value : null;
            })
            .catch(() => null),
    write: raw => appBridge.savePreferenceConfirmed({ key: RECORD_PREFERENCE_KEY, value: raw }).then(() => undefined),
};

export const useDeviceTokenRegistration = (): void => {
    const delegate = useMemo<runtime.push.DeviceTokenDelegate | null>(() => {
        const deviceToken = runtime.push.deviceToken;
        const platform = hostProfile().globals.CHATIC_APP_PLATFORM;
        if (!deviceToken || !platform) return null;
        return {
            fetchDeviceToken: () => deviceToken.fetch().catch(() => null),
            platform,
            application: APPLICATION,
            nativeRecordMirror,
        };
    }, []);

    runtime.push.useDeviceTokenRegistration(delegate);
};
