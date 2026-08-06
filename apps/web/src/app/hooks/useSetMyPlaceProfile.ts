import { useCallback } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/** What the shared profile form hands back on submit. */
export interface MyPlaceProfileInput {
    nick: string;
    thumbnail?: string;
}

/**
 * Saves MY profile for the active place (`profile.setMyProfile`).
 *
 * Lives here rather than inside the profile dialogs because four screens perform the same write —
 * the room-settings nudge, both invite paths, and the place-profile page — and the form itself must
 * stay free of domain knowledge to live in `ui/components` (directory-structure.md §4-5). Callers
 * pass the returned function straight to the form's `onSubmit`.
 */
export const useSetMyPlaceProfile = (): ((value: MyPlaceProfileInput, siteId?: string) => Promise<void>) => {
    const { profile: profileRepository } = useRuntimeRepositories();

    return useCallback(
        async ({ nick, thumbnail }: MyPlaceProfileInput, siteId?: string) => {
            // Discards the saved profile the write resolves to: the form's onSubmit is
            // Promise<void>, and readers observe the profile cache instead of this return value.
            if (siteId) {
                // Pinned write. `setMyProfile` reads the sid off the ambient context, which a site
                // switch only PRE-APPLIES optimistically before the token commits (app-runtime
                // `switchSite`) — a write racing that switch lands on the previous place. The
                // place-create flow knows exactly which place the profile belongs to, so it says so.
                await profileRepository.setProfile({ nick, thumbnail, siteId, active: true } as Parameters<
                    typeof profileRepository.setProfile
                >[0]);
                return;
            }
            await profileRepository.setMyProfile({ nick, thumbnail });
        },
        [profileRepository]
    );
};
