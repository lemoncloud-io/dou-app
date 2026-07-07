import { useCallback, useState } from 'react';

import { isNative } from '@chatic/bridges';
import { useDynamicDeviceId, useRegisterDeviceTokenMutation } from '@chatic/web-core';
import { useDeviceInfo } from '@chatic/device-utils';

import { appBridge } from '../../../bridge';
import { summarizeRegisterResult, type RegistrationSummary } from '../lib';

/**
 * Lifecycle of a single "check registration" run.
 * - `no-native`: not inside the app shell, so no push token exists.
 * - `no-token`: shell returned no token (permission denied / not yet issued).
 * - `done`: server responded; inspect `summary` for the verdict.
 */
export type PushRegistrationState = 'idle' | 'checking' | 'no-native' | 'no-token' | 'done' | 'error';

const APPLICATION = 'chatic';

export interface UsePushRegistration {
    state: PushRegistrationState;
    token: string | null;
    summary: RegistrationSummary | null;
    error: string | null;
    check: () => Promise<void>;
}

/**
 * Debug helper that confirms whether the current push token is registered on the
 * server. The backend exposes no read-only lookup, so this fetches the live
 * token from the native shell and performs an idempotent register-device call,
 * then summarizes the response (SNS endpoint / registeredAt) as the source of
 * truth. Only meaningful inside the native app shell.
 */
export const usePushRegistration = (): UsePushRegistration => {
    const { deviceInfo } = useDeviceInfo();
    // Same single source as socket identity and production push registration —
    // this debug check must confirm the exact record production writes.
    const { deviceId, firebaseInstallationId } = useDynamicDeviceId();
    const { mutateAsync } = useRegisterDeviceTokenMutation();

    const [state, setState] = useState<PushRegistrationState>('idle');
    const [token, setToken] = useState<string | null>(null);
    const [summary, setSummary] = useState<RegistrationSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    const check = useCallback(async () => {
        setError(null);
        setSummary(null);

        if (!isNative()) {
            setState('no-native');
            setError('Push token is only available inside the native app shell.');
            return;
        }

        setState('checking');
        try {
            const response = await appBridge.fetchFcmToken();
            const nextToken = response?.data?.token ?? null;
            setToken(nextToken);

            if (!nextToken) {
                setState('no-token');
                setError('No push token — permission denied or not issued yet.');
                return;
            }

            // No read-only endpoint exists, so registration is confirmed by an
            // idempotent register-device call (force re-runs it server-side).
            const result = await mutateAsync({
                deviceToken: nextToken,
                deviceId,
                platform: deviceInfo?.platform ?? window.CHATIC_APP_PLATFORM,
                installId: firebaseInstallationId,
                application: APPLICATION,
                force: true,
            });

            setSummary(summarizeRegisterResult(result));
            setState('done');
        } catch (e: any) {
            setState('error');
            setError(e?.message ?? 'Failed to check registration.');
        }
    }, [deviceId, firebaseInstallationId, deviceInfo?.platform, mutateAsync]);

    return { state, token, summary, error, check };
};
