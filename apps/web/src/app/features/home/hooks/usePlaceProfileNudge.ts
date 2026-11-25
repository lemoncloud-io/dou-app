import { useIsMutating } from '@tanstack/react-query';
import { useCallback } from 'react';

import { runtime } from '@chatic/runtime-react';

import { usePlaceProfileAbsent } from '../../../hooks/usePlaceProfileAbsent';
import { usePlaceProfileBannerStore } from '../stores/usePlaceProfileBannerStore';

export interface PlaceProfileNudgeOptions {
    nick?: string | null;
}

export interface PlaceProfileNudge {
    isVisible: boolean;
    dismiss: () => void;
    markPresent: () => void;
}

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
