import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';

import { useEnterInvitedChannel } from './useEnterInvitedChannel';
import { useEnterInvitedCloud } from './useEnterInvitedCloud';
import { useEnterInvitedSite } from './useEnterInvitedSite';
import { type InviteAcceptStep, resolveInviteErrorKey } from './resolveInviteErrorKey';
import type { InviteContext } from '../types';
import { useInviteFlow } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useRuntimeRepositories } from '@chatic/app-runtime';

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

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
        const { code, backend } = params;
        if (!code) return;
        if (!backend) {
            toast({ title: t('inviteAccept.missingServerInfo'), variant: 'destructive' });
            return;
        }

        // Tracks the pipeline step in flight so a failure can name where it happened. Every underlying
        // token call (delegate/exchange/refresh) is traced separately via traceTokenCall in web-core.
        let step: InviteAcceptStep = 'login-invite';
        try {
            await runInviteFlow({ code, backend });

            // Persist the invited cloud (cloudType:'invited') so it surfaces to useInvitedClouds /
            // the cloud sheet. Skipped when the invite carries no cloudId.
            if (info?.cloudId) {
                step = 'cache-cloud';
                await cloud.cacheWrite({
                    id: info.cloudId,
                    cid: info.cloudId,
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
