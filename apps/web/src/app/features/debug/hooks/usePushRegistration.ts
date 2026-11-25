import { useCallback, useState } from 'react';

import { hostProfile } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
import { useDeviceInfo } from '../../../hooks/useDeviceInfo';

import { summarizeRegisterResult, type RegistrationSummary } from '../lib';

export type PushRegistrationState = 'idle' | 'checking' | 'no-native' | 'no-token' | 'done' | 'error';

const APPLICATION = 'chatic';

export interface PushRegistrationMessages {
    noNative: string;
    noToken: string;
    checkFailed: string;
}

export interface UsePushRegistration {
    state: PushRegistrationState;
    token: string | null;
    summary: RegistrationSummary | null;
    error: string | null;
    check: () => Promise<void>;
}

export const usePushRegistration = (messages: PushRegistrationMessages): UsePushRegistration => {
    const { deviceInfo } = useDeviceInfo();
    const { deviceId, firebaseInstallationId } = runtime.session.useDynamicDeviceId();
    const { mutateAsync } = runtime.push.useRegisterDeviceTokenMutation();

    const [state, setState] = useState<PushRegistrationState>('idle');
    const [token, setToken] = useState<string | null>(null);
    const [summary, setSummary] = useState<RegistrationSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    const check = useCallback(async () => {
        setError(null);
        setSummary(null);

        const deviceToken = runtime.push.deviceToken;
        if (!deviceToken) {
            setState('no-native');
            setError(messages.noNative);
            return;
        }

        setState('checking');
        try {
            const nextToken = await deviceToken.fetch();
            setToken(nextToken);

            if (!nextToken) {
                setState('no-token');
                setError(messages.noToken);
                return;
            }

            const result = await mutateAsync({
                deviceToken: nextToken,
                deviceId,
                platform: deviceInfo?.platform ?? hostProfile().globals.CHATIC_APP_PLATFORM,
                installId: firebaseInstallationId,
                application: APPLICATION,
                force: true,
            });

            setSummary(summarizeRegisterResult(result));
            setState('done');
        } catch (e: any) {
            setState('error');
            setError(e?.message ?? messages.checkFailed);
        }
    }, [deviceId, firebaseInstallationId, deviceInfo?.platform, mutateAsync, messages]);

    return { state, token, summary, error, check };
};
