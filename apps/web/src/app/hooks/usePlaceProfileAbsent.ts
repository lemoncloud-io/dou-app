import { useCallback, useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';

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

export interface PlaceProfileGateOptions {
    /**
     * When false the read is held and `absent` stays `undefined`; it runs once this turns true.
     * Defaults to true. For a caller that mounts before the socket can carry the read — home on a
     * cold start — or while a place switch is moving the session: a read sent then fails, or answers
     * for the place being left, and the judgement fails open, so the answer would be a wrong
     * "present" rather than a late one.
     */
    enabled?: boolean;
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
 *
 * A verdict is kept together with the key it was read for, and only returned while that key is
 * current. The effect that starts a new read runs after the render that changed the key, so a bare
 * value would answer one render with the previous place's verdict.
 */
export const usePlaceProfileAbsent = ({ enabled = true }: PlaceProfileGateOptions = {}): PlaceProfileGate => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId: sid } = runtime.session.useSessionSelection();
    const { userId: uid } = runtime.session.useSessionIdentity();

    const key = sid && uid ? `${sid}@${uid}` : null;
    const [verdict, setVerdict] = useState<{ key: string; absent: boolean } | null>(null);

    useEffect(() => {
        if (!key || !enabled) return;

        let alive = true;
        void isPlaceProfileAbsent(profileRepository).then(result => {
            if (alive) setVerdict({ key, absent: result });
        });

        return () => {
            alive = false;
        };
    }, [profileRepository, key, enabled]);

    const markPresent = useCallback(() => {
        if (key) setVerdict({ key, absent: false });
    }, [key]);

    // No place to have a profile IN, so there is nothing to require: settle to "present" rather
    // than to the pending state. Pending is for "the answer is coming"; without a site it never
    // comes, and a caller that holds its render on `undefined` would wait forever. Same fail-open
    // direction as an inconclusive read — see isPlaceProfileAbsent.
    if (!key) return { absent: false, markPresent };
    return { absent: verdict?.key === key ? verdict.absent : undefined, markPresent };
};
