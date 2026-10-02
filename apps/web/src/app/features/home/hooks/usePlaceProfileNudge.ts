import { useIsMutating } from '@tanstack/react-query';
import { useCallback } from 'react';

import { runtime } from '@chatic/app-runtime';

import { usePlaceProfileAbsent } from '../../../hooks/usePlaceProfileAbsent';
import { usePlaceProfileBannerStore } from '../stores/usePlaceProfileBannerStore';

export interface PlaceProfileNudgeOptions {
    /** My nick in the active place as the cache holds it; a save anywhere hides the banner at once. */
    nick?: string | null;
}

export interface PlaceProfileNudge {
    isVisible: boolean;
    /** Close the banner for this place until the app is started again. */
    dismiss: () => void;
    /** Record a successful save, so the banner goes without another read. */
    markPresent: () => void;
}

/**
 * Whether home shows the "set up your profile in this place" banner.
 *
 * Shown only on the server's answer that I have no profile in the active place — never on a cache
 * that does not hold my row yet, which is how room settings once prompted people who had one. The
 * read waits for the socket and for any switch to settle: sent earlier it fails or answers for the
 * place being left, the judgement fails open, and the banner would be missing on a cold start, the
 * moment it matters most.
 *
 * "Any switch" is the app-wide count on the shared mutation keys, not home's own flag: a push tap or
 * the search screen switches places while home stays mounted, and moves the selection before the
 * session follows. A cached nick also holds the read — that person can never see the banner, and
 * re-asking on every return to home and every reconnect would only cost requests.
 */
export const usePlaceProfileNudge = ({ nick }: PlaceProfileNudgeOptions): PlaceProfileNudge => {
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { selectedSiteId: sid } = runtime.session.useSessionSelection();
    const { userId: uid } = runtime.session.useSessionIdentity();
    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;
    const hasNick = !!nick?.trim();
    const { absent, markPresent } = usePlaceProfileAbsent({ enabled: isVerified && !isSwitching && !hasNick });

    const profileId = sid && uid ? `${sid}@${uid}` : null;
    const isDismissed = usePlaceProfileBannerStore(state => (profileId ? !!state.dismissed[profileId] : false));
    const dismissProfileId = usePlaceProfileBannerStore(state => state.dismiss);

    const dismiss = useCallback(() => {
        if (profileId) dismissProfileId(profileId);
    }, [profileId, dismissProfileId]);

    const isVisible = !!profileId && absent === true && !isSwitching && !hasNick && !isDismissed;

    return { isVisible, dismiss, markPresent };
};
