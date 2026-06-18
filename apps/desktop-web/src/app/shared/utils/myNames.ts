import { useWebCoreStore } from '@chatic/web-core';

import { useSiteProfilesStore } from '../stores';

/**
 * The viewer's mention names: the global profile name plus this place's nick,
 * looked up by both uid and id (the site-profile map can be keyed by either).
 * Single source for the OS-notification mention filter and the mentions inbox
 * capture, so both decide "does this @-mention me" identically.
 */
export const resolveMyMentionNames = (): Array<string | undefined> => {
    const profile = useWebCoreStore.getState().profile;
    const placeProfiles = useSiteProfilesStore.getState().profiles;
    const uid = profile?.uid;
    const id = profile?.id;
    return [profile?.$user?.name, uid ? placeProfiles[uid]?.nick : undefined, id ? placeProfiles[id]?.nick : undefined];
};
