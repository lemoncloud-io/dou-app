import { runtime } from '@chatic/app-runtime';

import { useSiteProfilesStore } from '../stores';

/**
 * The viewer's mention names: the global profile name plus this place's nick,
 * looked up by the account uid. Single source for the OS-notification mention
 * filter and the mentions inbox capture, so both decide "does this @-mention me"
 * identically.
 */
export const resolveMyMentionNames = (): Array<string | undefined> => {
    const uid = runtime.session.getIdentityContext().userId ?? undefined;
    const user = runtime.session.getActiveSessionUser() as { name?: string } | null;
    const placeProfiles = useSiteProfilesStore.getState().profiles;
    return [user?.name, uid ? placeProfiles[uid]?.nick : undefined];
};
