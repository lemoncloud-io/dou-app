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
export const useSetMyPlaceProfile = (): ((value: MyPlaceProfileInput) => Promise<void>) => {
    const { profile: profileRepository } = useRuntimeRepositories();

    return useCallback(
        async ({ nick, thumbnail }: MyPlaceProfileInput) => {
            // Discards the saved profile setMyProfile resolves to: the form's onSubmit is
            // Promise<void>, and readers observe the profile cache instead of this return value.
            await profileRepository.setMyProfile({ nick, thumbnail });
        },
        [profileRepository]
    );
};
