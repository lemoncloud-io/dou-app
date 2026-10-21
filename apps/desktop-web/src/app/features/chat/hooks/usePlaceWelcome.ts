import { useCallback } from 'react';

import type { DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { isChannelOwner } from '../../channels';
import { isDmChannel, isSelfChannel, useSiteProfilesStore, useWelcomeStore, welcomeKey } from '../../../shared';
import { isDmBucket, shouldShowWelcome, type WelcomeSignals } from '../utils';

/**
 * The welcome page's state for the open place: whether it shows, how far its steps are along, and
 * Later. Every signal is read from what the app already holds — the place's channels, my profile in
 * it, and the invites this device sent — so nothing is fetched for it.
 */
export const usePlaceWelcome = ({
    channels,
    placeId,
    isLoading,
    isDefaultMode,
}: {
    channels: readonly DomainChannel[];
    /** The open place; undefined where there is none to welcome to. */
    placeId: string | undefined;
    isLoading: boolean;
    isDefaultMode: boolean;
}) => {
    const myUid = runtime.session.useSessionIdentity().userId ?? '';
    const key = welcomeKey(myUid, placeId ?? '');
    const dismissed = useWelcomeStore(s => !!s.dismissed[key]);
    const invited = useWelcomeStore(s => !!s.invited[key]);
    const hasProfile = useSiteProfilesStore(s => {
        const mine = myUid ? s.profiles[myUid] : undefined;
        return !!mine?.nick?.trim() || !!mine?.thumbnail;
    });

    const signals: WelcomeSignals = {
        ownsChannel: channels.some(channel => !isDmBucket(channel) && isChannelOwner(channel, myUid)),
        invited,
        hasDm: channels.some(channel => isDmChannel(channel) && !isSelfChannel(channel)),
        hasProfile,
    };
    const show = shouldShowWelcome({
        isDefaultMode,
        hasPlace: !!placeId && !!myUid,
        isLoading,
        channels,
        dismissed,
    });
    const later = useCallback(() => useWelcomeStore.getState().dismiss(key), [key]);

    return { show, signals, later };
};
