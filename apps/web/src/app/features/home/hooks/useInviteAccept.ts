import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';

import { useEnterInvitedChannel } from './useEnterInvitedChannel';
import { useEnterInvitedCloud } from './useEnterInvitedCloud';
import { useEnterInvitedSite } from './useEnterInvitedSite';
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
    const [hasError, setHasError] = useState(false);

    const accept = useCallback(async () => {
        const { code, backend } = params;
        if (!code) return;
        if (!backend) {
            toast({ title: t('inviteAccept.missingServerInfo'), variant: 'destructive' });
            return;
        }

        try {
            await runInviteFlow({ code, backend });

            // Persist the invited cloud (cloudType:'invited') so it surfaces to useInvitedClouds /
            // the cloud sheet. Skipped when the invite carries no cloudId.
            if (info?.cloudId) {
                await cloud.cacheWrite({
                    id: info.cloudId,
                    cid: info.cloudId,
                    backend: info.$envs?.backend,
                    wss: info.$envs?.wss,
                    cloudType: 'invited',
                });
            }

            await enterCloud(info);
            await enterSite(info);
            enterChannel(info);
        } catch (error) {
            const err = toError(error);
            logger.error('AUTH', '[useInviteAccept] accept failed', { error: err });

            if (err.message.includes('delegatorId')) {
                setMissingDelegator(true);
                return;
            }
            if (err.message.startsWith('TIMEOUT:')) {
                toast({ title: t('inviteAccept.timeout'), variant: 'destructive' });
            } else if (err.message.includes('Network Error') || err.message.includes('ERR_NETWORK')) {
                toast({ title: t('inviteAccept.networkError'), variant: 'destructive' });
            } else {
                toast({ title: t('inviteAccept.failed'), variant: 'destructive' });
            }
            setHasError(true);
        }
    }, [params, info, runInviteFlow, enterCloud, enterSite, enterChannel, toast, t]);

    return {
        accept,
        isAccepting: isInviting || isEnteringCloud || isEnteringSite,
        missingDelegator,
        hasError,
    };
};
