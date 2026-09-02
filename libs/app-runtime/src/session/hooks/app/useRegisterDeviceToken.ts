import { useEffect, useRef } from 'react';

import type { RegisterDeviceTokenBody } from '@lemoncloud/chatic-backend-api';

import { identityStore } from '../../store/stores';
import { useDynamicDeviceId } from './useDynamicDeviceId';
import { useRegisterDeviceTokenMutation } from '../../../data/hooks/device';

/**
 * Registers a push device token once per token value.
 * Skips registration if the same token is already stored in identityStore.
 * On success, persists the token to identityStore so subsequent mounts are no-ops.
 */
export const useRegisterDeviceToken = (
    body: (Omit<RegisterDeviceTokenBody, 'deviceId'> & { force?: boolean }) | null
): void => {
    const { deviceId } = useDynamicDeviceId();
    const { mutateAsync } = useRegisterDeviceTokenMutation();
    const pendingRef = useRef(false);

    const bodyRef = useRef(body);
    bodyRef.current = body;
    const deviceIdRef = useRef(deviceId);
    deviceIdRef.current = deviceId;
    const mutateRef = useRef(mutateAsync);
    mutateRef.current = mutateAsync;

    useEffect(() => {
        const currentBody = bodyRef.current;
        const deviceToken = currentBody?.deviceToken;
        if (!deviceToken) return;
        if (pendingRef.current) return;

        const stored = identityStore.getRegisteredDeviceToken();
        if (stored === deviceToken) return;

        pendingRef.current = true;
        const { force, ...rest } = currentBody!;
        mutateRef
            .current({ ...rest, deviceId: deviceIdRef.current ?? undefined, force })
            .then(() => {
                identityStore.setRegisteredDeviceToken(deviceToken);
            })
            .catch(() => {
                pendingRef.current = false;
            });
    }, [body?.deviceToken, deviceId]); // re-run when token or deviceId changes
};
