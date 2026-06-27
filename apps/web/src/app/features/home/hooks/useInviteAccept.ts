import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useNavigateWithTransition } from '@chatic/shared';
import { useInviteFlow } from '@chatic/web-core';
import { logger } from '@chatic/bridges';

import { useInviteCloudEntry } from './useInviteCloudEntry';
import { ROUTES } from '../../../routes/paths';
import type { InviteParams } from '../types';

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * Drives invite acceptance: logs in with the invite code via `useInviteFlow` (which returns the
 * token), then enters the cloud/site through `useInviteCloudEntry` using identifiers from that
 * token. No manual cloud/site state writes or sync flags — web-core owns that.
 */
export const useInviteAccept = (params: InviteParams) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { runInviteFlow, isInviting } = useInviteFlow();
    const { enterInvitedCloud, isEntering } = useInviteCloudEntry();

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
            const token = await runInviteFlow({ code, backend });

            await enterInvitedCloud(token);
            navigate(ROUTES.home, { replace: true });
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
    }, [params, runInviteFlow, enterInvitedCloud, navigate, toast, t]);

    return { accept, isAccepting: isInviting || isEntering, missingDelegator, hasError };
};
