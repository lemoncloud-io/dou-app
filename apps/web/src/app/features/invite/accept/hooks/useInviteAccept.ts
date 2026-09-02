import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';

import { useEnterInvitedChannel } from './useEnterInvitedChannel';
import { useEnterInvitedCloud } from './useEnterInvitedCloud';
import { useEnterInvitedSite } from './useEnterInvitedSite';
import type { InviteContext } from '../types';
import { useInviteFlow } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useRuntimeRepositories } from '@chatic/app-runtime';

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
 * Drives invite acceptance: logs in with the invite code via `useInviteFlow`, then enters the
 * invite target in order — cloud → site → channel — using identifiers from `MyInviteView`. Each
 * step no-ops when its identifier is absent; with no channel the channel step lands on home. No
 * manual cloud/site state writes or sync flags — web-core owns that.
 */
export const useInviteAccept = ({ params, info }: InviteContext) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { runInviteFlow, isInviting } = useInviteFlow();
    const { enterCloud, isEnteringCloud } = useEnterInvitedCloud();
    const { enterSite, isEnteringSite } = useEnterInvitedSite();
    const { enterChannel } = useEnterInvitedChannel();
    const { cloud } = useRuntimeRepositories();
    const [missingDelegator, setMissingDelegator] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const accept = useCallback(async () => {
        const { code, backend, relay } = params;
        if (!code) return;
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
        try {
            await runInviteFlow({ code, backend });

            // Persist the invited cloud (cloudType:'invited') so it surfaces to useInvitedClouds /
            // the cloud sheet. Skipped when the invite carries no cloudId. Both id and cid are keyed
            // to cloudId, so consumers that fall back id → cid always have a value.
            // Store the display info too (name + owner) so the switcher renders a proper label and
            // owner caption without a separate fetch: use the invite's cloudName as the label and
            // the inviter as the owner.
            if (info?.cloudId) {
                step = 'cache-cloud';
                await cloud.cacheWrite({
                    id: info.cloudId,
                    cid: info.cloudId,
                    name: info.cloudName,
                    ownerId: info.inviter$?.id,
                    owner$: info.inviter$ ? { id: info.inviter$.id, name: info.inviter$.name } : undefined,
                    backend: info.$envs?.backend,
                    wss: info.$envs?.wss,
                    cloudType: 'invited',
                });
            }

            step = 'enter-cloud';
            await enterCloud(info);
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
        }
    }, [params, info, runInviteFlow, enterCloud, enterSite, enterChannel, cloud, toast, t]);

    return {
        accept,
        isAccepting: isInviting || isEnteringCloud || isEnteringSite,
        missingDelegator,
        errorKey,
    };
};
