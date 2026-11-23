import { runtime } from '@chatic/runtime';

import { useSiteProfilesStore } from '../stores';

export const resolveMyMentionNames = (): Array<string | undefined> => {
    const uid = runtime.session.getIdentityContext().userId ?? undefined;
    const user = runtime.session.getActiveSessionUser() as { name?: string } | null;
    const placeProfiles = useSiteProfilesStore.getState().profiles;
    return [user?.name, uid ? placeProfiles[uid]?.nick : undefined];
};
