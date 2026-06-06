import { useCallback, useState } from 'react';

import type { CloudDelegationTokenView, MyInviteView, UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { useRegisterDevice } from '@chatic/auth';
import { useWebSocketV2Store } from '@chatic/socket';
import { useDynamicDeviceId } from '@chatic/app-runtime';
import {
    cloudCore,
    loginWithInviteCode,
    reportError,
    setIsInvitedSession,
    startWebCoreInit,
    toError,
    useWebCoreStore,
    webCore,
} from '@chatic/web-core';

import { fetchInviteCodeInfo } from '../apis';
import { parseInviteInput } from '../utils';

/**
 * Invite-code auth flow — mirrors apps/web LoginPage (fetchInvite + handleAccept):
 * 1. parse a full invite link OR a bare `invt:<id>:<code>` (link yields a backend override)
 * 2. register device (yields delegatorId / profile)
 * 3. resolve $envs.wss / cloudId / siteId from the target backend (best-effort)
 * 4. save delegation (backend + wss) so the socket/api target the invite's deployment
 * 5. exchange the code -> cloud token against that backend, persist cloud + selected place
 *
 * Works across deployments: the invite link carries its own backend, so the desktop
 * client doesn't need its .env to point at the same deployment that issued the invite.
 */
export const useInviteLogin = () => {
    const { deviceId } = useDynamicDeviceId();
    const { mutateAsync: registerDevice } = useRegisterDevice();
    const { setProfile, setIsAuthenticated } = useWebCoreStore();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isError, setIsError] = useState(false);

    const login = useCallback(
        async (input: string): Promise<boolean> => {
            const parsed = parseInviteInput(input);
            if (!parsed) return false;
            const { code, backend } = parsed;

            setIsSubmitting(true);
            setIsError(false);

            try {
                await startWebCoreInit();
                const { Token, ...rest } = await registerDevice(deviceId);
                if (!Token.identityToken) throw new Error('No identityToken in device registration');
                await webCore.buildCredentialsByToken(Token);
                setProfile(rest as unknown as UserProfile$);

                const delegatorId =
                    useWebCoreStore.getState().delegatorId ??
                    (rest as unknown as UserProfile$)?.uid ??
                    ((rest as Record<string, unknown>)?.id as string | undefined);
                if (!delegatorId) throw new Error('delegatorId unavailable after device registration');

                // Resolve the invite's deployment env (wss/cloud/site) when a backend is known.
                let info: MyInviteView | null = null;
                if (backend) {
                    info = await fetchInviteCodeInfo(code, backend).catch(error => {
                        logger.warn('AUTH', '[useInviteLogin] invite-code lookup failed; continuing', {
                            error: toError(error),
                        });
                        return null;
                    });
                }

                const wss = info?.$envs?.wss;
                if (backend && wss) {
                    cloudCore.saveDelegationToken({ backend, wss } as CloudDelegationTokenView);
                }

                const tokenView = await loginWithInviteCode(code, delegatorId, backend);
                if (!tokenView.Token?.identityToken) throw new Error('No identityToken from invite code');

                cloudCore.saveCloudToken(tokenView);
                const cloudId = info?.cloudId ?? tokenView.cloudId;
                if (cloudId) cloudCore.saveSelectedCloudId(cloudId);

                // Pre-select the invited place so the socket connects to it (mirrors web handleAccept).
                cloudCore.clearSelectedPlace();
                useWebSocketV2Store.getState().setSelectedPlaceId(null);
                const siteId = info?.siteId;
                if (siteId) {
                    cloudCore.saveSelectedSiteId(siteId);
                    useWebSocketV2Store.getState().setSelectedPlaceId(siteId);
                }

                setIsInvitedSession(true);
                setIsAuthenticated(true);
                return true;
            } catch (error) {
                const err = toError(error);
                logger.error('AUTH', '[useInviteLogin] login failed', { error: err });
                reportError(err);
                setIsError(true);
                return false;
            } finally {
                setIsSubmitting(false);
            }
        },
        [deviceId, registerDevice, setProfile, setIsAuthenticated]
    );

    return { login, isSubmitting, isError };
};
