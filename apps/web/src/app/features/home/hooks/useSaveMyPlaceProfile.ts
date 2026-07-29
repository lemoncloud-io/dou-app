import { useCallback } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/** What the shared place-profile form hands back on submit. */
export interface MyPlaceProfileInput {
    nick: string;
    thumbnail?: string;
}

/**
 * Persist the current user's profile for the active place (ADR-0020) — the same
 * `ProfileRepositoryV2.setMyProfile` write PlaceProfileEditDialog makes, named so a caller can wire
 * it straight into `PlaceProfileFormProps.onSubmit`.
 *
 * Returning a promise of nothing is deliberate: the repository resolves to the saved profile, but the
 * form only needs "did it work", and widening its contract would make every caller handle a value it
 * has no use for.
 */
export const useSaveMyPlaceProfile = () => {
    const { profile: profileRepository } = useRuntimeRepositories();

    return useCallback(
        async ({ nick, thumbnail }: MyPlaceProfileInput): Promise<void> => {
            await profileRepository.setMyProfile({ nick, thumbnail });
        },
        [profileRepository]
    );
};
