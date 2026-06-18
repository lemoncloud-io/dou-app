import { useCallback, useState } from 'react';

import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { useRegisterDevice } from '@chatic/web-core';
import { useDynamicDeviceId } from '@chatic/app-runtime';
import { cloudCore, reportError, startWebCoreInit, toError, useWebCoreStore, webCore } from '@chatic/web-core';

/**
 * Guest-session bootstrap — mirrors apps/web LoginPage.handleDeviceRegistration:
 * register the device against the broker (no Invite Code, no email), build
 * credentials, default to the relay Cloud ('default'), then authenticate. Lands
 * the user in the Default Cloud's Self Channel. Distinct from useInviteLogin,
 * which additionally exchanges an Invite Code for a cloud-scoped token.
 */
export const useGuestLogin = () => {
    const { deviceId } = useDynamicDeviceId();
    const { mutateAsync: registerDevice } = useRegisterDevice();
    const { setProfile, setIsAuthenticated } = useWebCoreStore();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isError, setIsError] = useState(false);

    const submit = useCallback(async (): Promise<boolean> => {
        setIsSubmitting(true);
        setIsError(false);
        try {
            await startWebCoreInit();
            const { Token, ...rest } = await registerDevice(deviceId);
            if (!Token.identityToken) throw new Error('No identityToken in device registration');
            await webCore.buildCredentialsByToken(Token);
            setProfile(rest as unknown as UserProfile$);
            // Default to the relay/Default Cloud unless a prior cloud is persisted.
            if (!cloudCore.getSelectedCloudId()) cloudCore.saveSelectedCloudId('default');
            setIsAuthenticated(true);
            return true;
        } catch (error) {
            const err = toError(error);
            logger.error('AUTH', '[useGuestLogin] device registration failed', { error: err });
            reportError(err);
            setIsError(true);
            return false;
        } finally {
            setIsSubmitting(false);
        }
    }, [deviceId, registerDevice, setProfile, setIsAuthenticated]);

    return { submit, isSubmitting, isError };
};
