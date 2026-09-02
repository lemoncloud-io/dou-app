import { useCallback, useState } from 'react';

import { logger } from '@chatic/bridges';
import { useDynamicDeviceId, useLoginRelayGuestByDevice } from '@chatic/app-runtime';
import { startWebTransportInit } from '@chatic/app-runtime';

import { toError } from '../../../shared';

/**
 * Guest-session bootstrap — mirrors apps/web's relay guest login: register the
 * device against the broker (no Invite Code, no email) via
 * `useLoginRelayGuestByDevice`, which builds credentials, persists the device id
 * and hydrates the relay identity. Lands the user in the Default Cloud's Self
 * Channel. Distinct from useInviteLogin, which additionally exchanges an Invite
 * Code for a cloud-scoped token.
 */
export const useGuestLogin = () => {
    const { deviceId } = useDynamicDeviceId();
    const { mutateAsync: loginGuest, isPending } = useLoginRelayGuestByDevice();
    const [isError, setIsError] = useState(false);

    const submit = useCallback(async (): Promise<boolean> => {
        setIsError(false);
        try {
            await startWebTransportInit();
            await loginGuest(deviceId);
            return true;
        } catch (error) {
            const err = toError(error);
            logger.error('AUTH', '[useGuestLogin] device registration failed', { error: err });
            setIsError(true);
            return false;
        }
    }, [deviceId, loginGuest]);

    return { submit, isSubmitting: isPending, isError };
};
