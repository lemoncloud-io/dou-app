import { useCallback, useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity, useSessionSelection } from '@chatic/app-runtime';

import { isPlaceProfileAbsent } from '../utils/placeProfile';

export interface PlaceProfileGate {
    /** Whether the active place still needs a profile — `undefined` until the answer lands. */
    absent: boolean | undefined;
    /**
     * Record that a profile now exists. Call after a successful save: the caller already knows the
     * answer, so re-asking the server would only add a round trip the user waits through.
     */
    markPresent: () => void;
}

/**
 * Gate for "does the active place still need a profile of mine?".
 *
 * A one-shot awaited read (see {@link isPlaceProfileAbsent}), not a subscription: callers gate a
 * render on it, and a reactive `null` would mean "loading" and "absent" at once. The pending state
 * always clears because the judgement fails open instead of throwing.
 *
 * Re-judges whenever the profile's identity changes — `${sid}@${uid}`, the same key `useMyProfile`
 * observes. The site alone is not enough: guest→main promotion swaps `uid` while leaving the relay
 * site untouched, and a verdict computed as the device user would otherwise carry over to the promoted
 * user. That user has no profile by definition, so a stale "present" would skip the gate exactly where
 * it matters most.
 */
export const usePlaceProfileAbsent = (): PlaceProfileGate => {
    const { profile: profileRepository } = useRuntimeRepositories();
    const { selectedSiteId: sid } = useSessionSelection();
    const { userId: uid } = useSessionIdentity();

    const [absent, setAbsent] = useState<boolean | undefined>(undefined);

    useEffect(() => {
        // No place to have a profile IN, so there is nothing to require: settle to "present" rather
        // than to the pending state. Pending is for "the answer is coming"; without a site it never
        // comes, and a caller that holds its render on `undefined` would wait forever. Same fail-open
        // direction as an inconclusive read — see isPlaceProfileAbsent.
        if (!sid || !uid) {
            setAbsent(false);
            return;
        }

        let alive = true;
        setAbsent(undefined);
        void isPlaceProfileAbsent(profileRepository).then(result => {
            if (alive) setAbsent(result);
        });

        return () => {
            alive = false;
        };
    }, [profileRepository, sid, uid]);

    const markPresent = useCallback(() => setAbsent(false), []);

    return { absent, markPresent };
};
