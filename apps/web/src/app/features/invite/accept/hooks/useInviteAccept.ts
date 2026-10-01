import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';

import { useEnterInvitedChannel } from './useEnterInvitedChannel';
import { useEnterInvitedCloud } from './useEnterInvitedCloud';
import { useEnterInvitedSite } from './useEnterInvitedSite';
import type { InviteContext } from '../types';
import { withAcceptor } from '../../../../utils/invitedCloudAcceptance';
import { runtime } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** The invite-accept pipeline step that was in flight when an error was thrown. */
type InviteAcceptStep = 'login-invite' | 'cache-cloud' | 'enter-cloud' | 'enter-site' | 'enter-channel';

/**
 * Maps a failure (the step it happened in + the thrown error) to a specific `inviteAccept.*` i18n key
 * so the toast and error panel can name the actual cause instead of a generic "failed".
 *
 * Ordering matters: transport-shape errors (timeout/network) are checked first since they can occur in
 * any step. Server errors arrive as HTTP-200 bodies like `"400 INVALID - ..."` (see throwIfApiError),
 * so we match by HTTP-code substring — the same convention used by ErrorFallback. `delegatorId` is not
 * handled here: it is branched to the missing-delegator panel before this helper runs.
 */
const resolveInviteErrorKey = (step: InviteAcceptStep, err: Error): string => {
    const message = err.message;

    if (message.startsWith('TIMEOUT:')) return 'inviteAccept.timeout';
    if (message.includes('Network Error') || message.includes('ERR_NETWORK')) return 'inviteAccept.networkError';

    if (step === 'login-invite') {
        // The invite itself is bad: expired, revoked, or a malformed code.
        if (message.includes('400') || message.includes('404')) return 'inviteAccept.expired';
        // Authentication/authorization rejected the invite login.
        if (message.includes('401') || message.includes('403')) return 'inviteAccept.authVerifyFailed';
        return 'inviteAccept.failed';
    }

    // Login succeeded but a later token/entry step failed — the user is registered but couldn't enter.
    return 'inviteAccept.enterFailed';
};

/**
 * Drives invite acceptance: logs in with the invite code via `runtime.session.useInviteFlow`, then enters the
 * invite target in order — cloud → site → channel — using identifiers from `MyInviteView`. Each
 * step no-ops when its identifier is absent; with no channel the channel step only leaves the accept screen. No
 * manual cloud/site state writes or sync flags — web-core owns that.
 */
export const useInviteAccept = ({ params, info }: InviteContext) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { runInviteFlow, isInviting } = runtime.session.useInviteFlow();
    const { enterCloud, isEnteringCloud } = useEnterInvitedCloud();
    const { enterSite, isEnteringSite } = useEnterInvitedSite();
    const { enterChannel } = useEnterInvitedChannel();
    const { cloud } = runtime.data.useRuntimeRepositories();
    // The guest the invite login binds the acceptance to — recorded on the cached cloud below.
    const { delegatorId } = runtime.session.useSessionIdentity();
    const [missingDelegator, setMissingDelegator] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    // One pipeline at a time, for its whole length. The step hooks each report only their own call,
    // which leaves gaps between steps (the cache write) and during the cloud step's retry waits —
    // seconds in which Accept looked idle and a second press started a second pipeline.
    const [isRunning, setIsRunning] = useState(false);
    const runningRef = useRef(false);

    const accept = useCallback(async () => {
        const { code, backend, relay } = params;
        if (!code || runningRef.current) return;
        // Relay invites legitimately carry no backend address: registerUserWithInviteCode resolves the
        // env relay endpoint. Only a link that is neither addressed nor marked relay is unusable.
        if (!backend && !relay) {
            logger.warn('INVITE', 'invite entry missing server info', { hasBackend: !!backend, relay: !!relay });
            toast({ title: t('inviteAccept.missingServerInfo'), variant: 'destructive' });
            return;
        }

        // Tracks the pipeline step in flight so a failure can name where it happened. Every underlying
        // token call (delegate/exchange/refresh) is traced separately via traceTokenCall in web-core.
        let step: InviteAcceptStep = 'login-invite';
        runningRef.current = true;
        setIsRunning(true);
        try {
            // The answer is the invitee's own cloud token; the cloud is entered with it (see
            // `useEnterInvitedCloud` for why a re-issue cannot stand in for it).
            const inviteToken = await runInviteFlow({ code, backend });

            // Entered BEFORE the cloud is cached. Caching it lists it, and a listed cloud is what the
            // background sockets prepare a socket for — by re-issuing through `delegate-cloud`. Once
            // the cloud is committed it is left out of that list, so nothing can re-issue it under
            // the entry and land the cloud's socket on a user other than the invitee.
            step = 'enter-cloud';
            await enterCloud(info, inviteToken);

            // Persist the invited cloud (cloudType:'invited') so it surfaces to useInvitedClouds /
            // the cloud sheet. Skipped when the invite carries no cloudId. Both id and cid are keyed
            // to cloudId, so consumers that fall back id → cid always have a value.
            // Store the display info too (name + owner) so the switcher renders a proper label and
            // owner caption without a separate fetch: use the invite's cloudName as the label and
            // the inviter as the owner.
            // `acceptedBy` adds this guest to whoever accepted the cloud on this device before, read
            // back first because the write replaces the field rather than merging it.
            if (info?.cloudId) {
                step = 'cache-cloud';
                const existing = await cloud.cacheRead(info.cloudId);
                await cloud.cacheWrite({
                    id: info.cloudId,
                    cid: info.cloudId,
                    name: info.cloudName,
                    ownerId: info.inviter$?.id,
                    owner$: info.inviter$ ? { id: info.inviter$.id, name: info.inviter$.name } : undefined,
                    backend: info.$envs?.backend,
                    wss: info.$envs?.wss,
                    cloudType: 'invited',
                    acceptedBy: withAcceptor(existing?.acceptedBy, delegatorId),
                });
            }

            step = 'enter-site';
            await enterSite(info);
            step = 'enter-channel';
            enterChannel(info);
            logger.info('INVITE', 'cloud invite accepted; entering channel', { cloudId: info?.cloudId });
        } catch (error) {
            const err = toError(error);
            logger.error('AUTH', `[useInviteAccept] accept failed at step=${step}`, { error: err, data: { step } });

            if (err.message.includes('delegatorId')) {
                setMissingDelegator(true);
                return;
            }

            const key = resolveInviteErrorKey(step, err);
            toast({ title: t(key), variant: 'destructive' });
            setErrorKey(key);
        } finally {
            runningRef.current = false;
            setIsRunning(false);
        }
    }, [params, info, runInviteFlow, enterCloud, enterSite, enterChannel, cloud, delegatorId, toast, t]);

    return {
        accept,
        isAccepting: isRunning || isInviting || isEnteringCloud || isEnteringSite,
        missingDelegator,
        errorKey,
    };
};
