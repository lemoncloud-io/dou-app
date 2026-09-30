import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

/** What the shared profile form hands back on submit. */
export interface MyPlaceProfileInput {
    nick: string;
    thumbnail?: string;
}

/**
 * Saves MY profile for the place the session is in (`profile.setMyProfile`).
 *
 * Lives here rather than inside the profile dialogs because several screens perform the same write —
 * the room-settings nudge, both invite paths, the setup wizard — and the form itself must stay free
 * of domain knowledge to live in `ui/components` (directory-structure.md §4-5). Callers pass the
 * returned function straight to the form's `onSubmit`.
 *
 * **Only the active place, and only once the session is really there.** The server writes
 * `profile.set` to the site its session is on and ignores the site named in the payload, so there is
 * no way to set a profile for any other place: a caller that needs one for a new place switches into
 * it first. For the same reason the write refuses while a site switch is in flight — the switch
 * pre-applies the selection before `auth.switch` commits, so during that window the selection names
 * a place the session is not on yet, and the write would land on the previous one.
 */
export const useSetMyPlaceProfile = (): ((value: MyPlaceProfileInput) => Promise<void>) => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const queryClient = useQueryClient();

    return useCallback(
        async ({ nick, thumbnail }: MyPlaceProfileInput) => {
            if (!selectedSiteId) throw new Error('[useSetMyPlaceProfile] no active place');
            // Read at call time, not render time: a switch can start between the render that built
            // this callback and the tap that runs it.
            if (queryClient.isMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) > 0) {
                throw new Error('[useSetMyPlaceProfile] a place switch is in flight');
            }
            // Discards the saved profile the write resolves to: the form's onSubmit is
            // Promise<void>, and readers observe the profile cache instead of this return value.
            await profileRepository.setMyProfile({ nick, thumbnail }, selectedSiteId);
        },
        [profileRepository, selectedSiteId, queryClient]
    );
};
