import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { getSocketManager, useSiteSwitch } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

/** Upper bound for awaiting the socket handshake before a search-driven cloud switch. */
const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

/**
 * Navigates to a search result, switching cloud and place first when the result belongs to a
 * non-active one (see usePushNavigate.ts for the same handshake-gated switch pattern).
 *
 * The place (sid) switch is required, not optional: a place result lands on the home screen, and
 * home renders the session's `selectedSiteId` rather than anything from the URL
 * (HomePage.tsx:65,184). A channel result switches too, so backing out of the room lands on the
 * home of the place that channel belongs to. See ADR-0033 and
 * docs/specs/search/web-search-page.md.
 *
 * The switch runs cloud-first, and the handshake is awaited AGAIN after it: `switchSite` is a
 * socket call (`auth.switch`) on the freshly bound connection, so calling it before that
 * connection verifies fails.
 *
 * Failures surface as a toast (not a silent best-effort navigation) — the user actively
 * clicked a search result and is waiting, so a silent wrong destination would be worse
 * than telling them it didn't work. A cloud switch that succeeded is NOT rolled back when the
 * place switch then fails: rolling back is another failure-prone round trip, which would leave
 * the session in a less certain state than simply stopping here.
 */
export const useSearchNavigate = () => {
    const navigate = useNavigate();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const { switchCloud } = useSwitchCloudSession();
    const { switchSite } = useSiteSwitch();
    const { toast } = useToast();
    const { t } = useTranslation();
    const inFlightRef = useRef(false);

    const goTo = useCallback(
        async (target: string, options?: { cid?: string; sid?: string }) => {
            if (inFlightRef.current) return;
            inFlightRef.current = true;

            const { cid, sid } = options ?? {};
            const needsCloudSwitch = !!cid && cid !== selectedCloudId;
            // After a cloud switch the active site is whatever the target cloud's session picked,
            // which `selectedSiteId` no longer describes — so switch unconditionally in that case.
            const needsSiteSwitch = !!sid && (needsCloudSwitch || sid !== selectedSiteId);

            const awaitVerified = async () => {
                const verified = await getSocketManager().waitUntilVerified(HANDSHAKE_WAIT_TIMEOUT_MS);
                if (!verified) {
                    logger.warn('SEARCH', 'socket handshake not verified before search navigation', {
                        cid,
                        sid,
                    });
                    toast({ title: t('search.navigateFailed', '이동할 수 없어요. 잠시 후 다시 시도해주세요.') });
                }
                return verified;
            };

            try {
                if (needsCloudSwitch) {
                    if (!(await awaitVerified())) return;
                    await switchCloud(cid);
                    // The target cloud's socket has to verify before `auth.switch` can ride it.
                    if (needsSiteSwitch && !(await awaitVerified())) return;
                }
                if (needsSiteSwitch) {
                    await switchSite(sid as string);
                }
                navigate(target);
            } catch (error) {
                // The error used to be discarded without even a binding. When the cause is the cloud
                // switch this is a second entry alongside the session service's — accepted, because
                // this one carries the user-facing outcome (the result they clicked never opened).
                logger.error('SEARCH', 'navigate to search result failed', { error, data: { cid, sid } });
                toast({ title: t('search.navigateFailed', '이동할 수 없어요. 잠시 후 다시 시도해주세요.') });
            } finally {
                inFlightRef.current = false;
            }
        },
        [navigate, selectedCloudId, selectedSiteId, switchCloud, switchSite, toast, t]
    );

    return { goTo };
};
