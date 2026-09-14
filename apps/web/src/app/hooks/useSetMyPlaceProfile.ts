import { useCallback } from 'react';

import { runtime } from '@chatic/app-runtime';

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
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();

    return useCallback(
        async ({ nick, thumbnail }: MyPlaceProfileInput, siteId?: string) => {
            // Discards the saved profile the write resolves to: the form's onSubmit is
            // Promise<void>, and readers observe the profile cache instead of this return value.
            //
            // One path. The write names its place — the caller's when it knows one (the place-create
            // flow does), otherwise the selected place. This used to fork: `setMyProfile` read the
            // site off the ambient data context, which a site switch only PRE-APPLIES before the
            // token commits, so a write racing that switch landed on the previous place. The fork
            // existed to dodge that; now that the site is an argument there is nothing to dodge
            // (ADR-0085).
            await profileRepository.setMyProfile({ nick, thumbnail }, siteId ?? selectedSiteId ?? '');
        },
        [profileRepository, selectedSiteId]
    );
};
