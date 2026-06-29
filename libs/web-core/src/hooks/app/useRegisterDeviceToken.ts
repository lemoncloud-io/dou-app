import { useEffect, useRef } from 'react';

import type { RegisterDeviceTokenBody } from '@lemoncloud/chatic-backend-api';

import { identityCore } from '../../session/core/identityCore';
import { useDynamicDeviceId } from './useDynamicDeviceId';
import { useRegisterDeviceTokenMutation } from '../user';

/**
 * Registers a push device token once per token value.
 * Skips registration if the same token is already stored in identityCore.
 * On success, persists the token to identityCore so subsequent mounts are no-ops.
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

        const stored = identityCore.getRegisteredDeviceToken();
        if (stored === deviceToken) return;

        pendingRef.current = true;
        const { force, ...rest } = currentBody!;
        mutateRef
            .current({ ...rest, deviceId: deviceIdRef.current ?? undefined, force })
            .then(() => {
                identityCore.setRegisteredDeviceToken(deviceToken);
            })
            .catch(() => {
                pendingRef.current = false;
            });
    }, [body?.deviceToken, deviceId]); // re-run when token or deviceId changes
};
