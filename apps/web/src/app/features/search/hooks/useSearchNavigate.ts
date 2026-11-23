import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

export const useSearchNavigate = () => {
    const navigate = useNavigate();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { switchCloud } = runtime.session.useSwitchCloudSession();
    const { switchSite } = runtime.session.useSiteSwitch();
    const { toast } = useToast();
    const { t } = useTranslation();
    const inFlightRef = useRef(false);

    const goTo = useCallback(
        async (target: string, options?: { cid?: string; sid?: string }) => {
            if (inFlightRef.current) return;
            inFlightRef.current = true;

            const { cid, sid } = options ?? {};
            const needsCloudSwitch = !!cid && cid !== selectedCloudId;
            const needsSiteSwitch = !!sid && (needsCloudSwitch || sid !== selectedSiteId);

            const awaitVerified = async () => {
                const verified = await runtime.connection.waitUntilVerified(null, HANDSHAKE_WAIT_TIMEOUT_MS);
                if (!verified) {
                    logger.warn('SEARCH', 'socket handshake not verified before search navigation', {
                        cid,
                        sid,
                    });
                    toast({ title: t('search.navigateFailed') });
                }
                return verified;
            };

            try {
                if (needsCloudSwitch) {
                    if (!(await awaitVerified())) return;
                    await switchCloud(cid);
                    if (needsSiteSwitch && !(await awaitVerified())) return;
                }
                if (needsSiteSwitch) {
                    await switchSite(sid as string);
                }
                navigate(target);
            } catch (error) {
                logger.error('SEARCH', 'navigate to search result failed', { error, data: { cid, sid } });
                toast({ title: t('search.navigateFailed') });
            } finally {
                inFlightRef.current = false;
            }
        },
        [navigate, selectedCloudId, selectedSiteId, switchCloud, switchSite, toast, t]
    );

    return { goTo };
};
