import { logger } from '@chatic/bridges';
import type { DomainProfile } from '@chatic/data';

/**
 * The one repository method this judgement needs. Structural rather than the full
 * `IProfileRepositoryV2` so tests can pass a two-line fake.
 */
export interface MyPlaceProfileReader {
    getMyProfile(): Promise<DomainProfile | null>;
}

/**
 * Does the active place have no profile of mine yet?
 *
 * Awaited, not observed. The reactive read (`useMyProfile`) returns `null` for "still loading" and
 * "genuinely absent" alike, and the create form starts from an empty nick — so a single loading frame
 * judged as absent would let a save overwrite an existing nick and photo. `invite.accept` runs inside
 * an async chain and the invite form can wait one round trip, so both callers simply await the answer
 * and the ambiguity never arises (ADR-0041 decision 5).
 *
 * `nick` alone is not enough in the other direction either: `profile.get-mine` is a get-or-create
 * (ADR-0007), so it answers even when there is no real profile, and `active: 0` is the flag that says
 * so. A missing nick without that flag is inconclusive.
 *
 * **Fails open.** Anything short of a definite "no profile" returns false, letting the caller proceed:
 * blocking on an inconclusive read would turn a profile-read outage into "cannot invite / cannot
 * accept", while guessing "absent" risks the overwrite above. The precondition exists to shape the
 * normal path, not to hold the user's goal hostage on the abnormal one.
 */
export const isPlaceProfileAbsent = async (reader: MyPlaceProfileReader): Promise<boolean> => {
    let profile: DomainProfile | null;
    try {
        profile = await reader.getMyProfile();
    } catch (error) {
        logger.warn('PROFILE', '[isPlaceProfileAbsent] get-mine failed; treating the profile as present', { error });
        return false;
    }

    if (profile?.nick?.trim()) return false;
    return profile?.active === false;
};
