import { useCallback, useState } from 'react';

import type { ProfileBody } from '@lemoncloud/chatic-socials-api';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';

/**
 * My Place Profile (current place) — load the editable setting and save it.
 *
 * Read is lazy (`load`) so we only hit `user.get-site-profile` when the edit
 * surface opens, not on every app render. Save is optimistic in the repository
 * (writes the `profile` cache before the network, rolls back on error), so the
 * caller just awaits and surfaces a toast on failure.
 *
 * Fail-soft (ADR 0007): a load error resolves to `null` so the form seeds from
 * the Global Profile instead of breaking — the feature runs in all modes incl.
 * relay, where these ops are unverified.
 */
export const useMyProfile = () => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    // The server writes a profile to the place the session is on, whatever place the request names.
    // The save still names the selected place: the repository tags its optimistic row with it and
    // rejects when the answer comes back from another place.
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const [profile, setProfile] = useState<DomainProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await profileRepository.getMyProfile();
            setProfile(result);
            return result;
        } catch (error) {
            logger.error('PROFILE', '[useMyProfile] load failed → fall back to Global', { error });
            setProfile(null);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [profileRepository]);

    const save = useCallback(
        async (body: ProfileBody): Promise<DomainProfile> => {
            setIsSaving(true);
            try {
                const result = await profileRepository.setMyProfile(body, selectedSiteId ?? '');
                setProfile(result);
                return result;
            } finally {
                setIsSaving(false);
            }
        },
        // `selectedSiteId` is a dependency: the dialog stays mounted across place switches, and a
        // closure over the first place named it on every later save — which the repository now
        // rejects as a write that landed elsewhere, although it landed where the user was.
        [profileRepository, selectedSiteId]
    );

    return { profile, isLoading, isSaving, load, save };
};
