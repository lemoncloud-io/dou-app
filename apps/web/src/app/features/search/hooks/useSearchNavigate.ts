import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { getSocketManager } from '@chatic/app-runtime';
import { useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

/** Upper bound for awaiting the socket handshake before a search-driven cloud switch. */
const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

/**
 * Navigates to a search result, switching cloud first when the result belongs to a
 * non-active cloud (see usePushNavigate.ts for the same handshake-gated switch pattern).
 *
 * Unlike push navigation, this never switches the site: every destination page (place,
 * channel room) reads its own id from the URL, not from the session's selected site, so a
 * site switch isn't required for the page to load correctly.
 *
 * Failures surface as a toast (not a silent best-effort navigation) — the user actively
 * clicked a search result and is waiting, so a silent wrong destination would be worse
 * than telling them it didn't work.
 */
export const useSearchNavigate = () => {
    const navigate = useNavigate();
    const { selectedCloudId } = useSessionSelection();
    const { switchCloud } = useSwitchCloudSession();
    const { toast } = useToast();
    const { t } = useTranslation();
    const inFlightRef = useRef(false);

    const goTo = useCallback(
        async (target: string, options?: { cid?: string }) => {
            if (inFlightRef.current) return;
            inFlightRef.current = true;

            const cid = options?.cid;
            const needsSwitch = !!cid && cid !== selectedCloudId;

            try {
                if (needsSwitch) {
                    const verified = await getSocketManager().waitUntilVerified(HANDSHAKE_WAIT_TIMEOUT_MS);
                    if (!verified) {
                        toast({ title: t('search.navigateFailed', '이동할 수 없어요. 잠시 후 다시 시도해주세요.') });
                        return;
                    }
                    await switchCloud(cid);
                }
                navigate(target);
            } catch {
                toast({ title: t('search.navigateFailed', '이동할 수 없어요. 잠시 후 다시 시도해주세요.') });
            } finally {
                inFlightRef.current = false;
            }
        },
        [navigate, selectedCloudId, switchCloud, toast, t]
    );

    return { goTo };
};
