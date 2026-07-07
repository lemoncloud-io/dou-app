import { useCallback, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { cloudsKeys } from '@chatic/users';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import {
    getIdentityContext,
    registerUserWithInviteCode,
    reportError,
    startWebCoreInit,
    useDynamicDeviceId,
    useLoginRelayGuestByDevice,
    useSiteSwitch,
    useSwitchCloudSession,
} from '@chatic/web-core';

import { toError, useJoinedCloudsStore } from '../../../shared';
import { fetchInviteCodeInfo } from '../apis';
import { extractServerErrorMessage, parseInviteInput } from '../utils';
import type { InviteLoginError } from '../utils';

/**
 * Invite-code auth flow — mirrors apps/web's invite acceptance (useInviteAccept +
 * useEnterInvitedCloud/Site) re-shaped into one hook for the desktop login screen:
 * 1. parse a full invite link OR a bare `invt:<id>:<code>` (link yields a backend override)
 * 2. guest-login the device (yields the delegatorId the invite exchange needs + hydrates session)
 * 3. resolve $envs.wss / cloudId / siteId from the target backend (best-effort)
 * 4. exchange the code -> cloud token against that backend (registerUserWithInviteCode)
 * 5. persist the invited cloud locally, then enter cloud + site via the v2 session switches
 *
 * web-core owns credential/cloud/site state + socket re-auth — no manual cloudCore /
 * socket-store writes here. Works across deployments: the invite link carries its own
 * backend, so the desktop client doesn't need its .env pointed at the issuing deployment.
 */
export const useInviteLogin = () => {
    const { deviceId } = useDynamicDeviceId();
    const { mutateAsync: loginGuest } = useLoginRelayGuestByDevice();
    const { switchCloud } = useSwitchCloudSession();
    const { switchSite } = useSiteSwitch();
    const { cloud: cloudRepository } = useRuntimeRepositories();
    const addJoinedCloud = useJoinedCloudsStore(s => s.addJoinedCloud);
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<InviteLoginError | null>(null);

    const login = useCallback(
        async (input: string): Promise<boolean> => {
            const parsed = parseInviteInput(input);
            if (!parsed) {
                // Unparseable paste — previously failed silently; tell the user why.
                setError({ kind: 'format' });
                return false;
            }
            const { code, backend } = parsed;

            setIsSubmitting(true);
            setError(null);

            try {
                await startWebCoreInit();
                // The invite exchange is signed with a guest delegatorId. Reuse the existing
                // guest session if there is one (the in-app "Join" dialog is reachable with a
                // session already live) — only bootstrap a guest when none exists. A real,
                // non-guest user has no delegatorId, so accepting here would silently downgrade
                // them to a guest; surface that instead of clobbering their identity.
                let delegatorId = getIdentityContext().delegatorId;
                if (!delegatorId) {
                    const identity = getIdentityContext();
                    if (identity.isAuthenticated && !identity.isGuest) {
                        throw new Error('Log out of your account before joining with an invite code.');
                    }
                    await loginGuest(deviceId);
                    delegatorId = getIdentityContext().delegatorId;
                }
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

                const tokenView = await registerUserWithInviteCode(code, delegatorId, backend);

                // `tokenView.cloudId` is the cloud's AWS account-no; the invite carries no real
                // cloud id, so it's the only identifier for this invited cloud and is used purely
                // as its restore key. The session switch guards against an account-no target.
                const cloudId = info?.cloudId ?? tokenView.cloudId;
                if (cloudId) {
                    // Invited clouds aren't in the relay catalog — persist locally (with the
                    // invite's backend/wss) so the rail surfaces it and the cloud switch can
                    // resolve its endpoints. Mirrors apps/web useInviteAccept.
                    await cloudRepository.cacheWrite({
                        id: cloudId,
                        cid: cloudId,
                        backend: info?.$envs?.backend ?? backend ?? undefined,
                        wss: info?.$envs?.wss ?? undefined,
                        cloudType: 'invited',
                    });
                    // Remember the joined cloud so the rail shows it immediately —
                    // the broker cloud list is eventually consistent and may omit it.
                    addJoinedCloud({ id: cloudId, name: info?.cloudName ?? undefined });
                    // Enter the invited cloud — web-core commits the cloud session and
                    // re-authenticates the socket (no manual socket-store writes).
                    await switchCloud(cloudId);
                }

                // Enter the invited place so the socket connects to it (mirrors web handleAccept).
                if (info?.siteId) {
                    await switchSite(info.siteId);
                }

                // The broker cloud list is eventually consistent — refetch so the
                // just-joined cloud appears in the rail alongside the Default Cloud.
                void queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
                return true;
            } catch (error) {
                const err = toError(error);
                logger.error('AUTH', '[useInviteLogin] login failed', { error: err });
                reportError(err);
                setError({ kind: 'server', message: extractServerErrorMessage(err) });
                return false;
            } finally {
                setIsSubmitting(false);
            }
        },
        [deviceId, loginGuest, switchCloud, switchSite, cloudRepository, addJoinedCloud, queryClient]
    );

    return { login, isSubmitting, error };
};
