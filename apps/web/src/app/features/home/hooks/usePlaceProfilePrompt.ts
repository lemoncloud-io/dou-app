import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';
import {
    SWITCH_CLOUD_MUTATION_KEY,
    SWITCH_SITE_MUTATION_KEY,
    useSessionIdentity,
    useSessionSelection,
} from '@chatic/web-core';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';

type PromptStatus = 'unknown' | 'present' | 'absent';

/** A place profile counts as "set" once it carries a non-empty nick. */
const hasNick = (profile: DomainProfile | null): boolean => !!profile?.nick?.trim();

/**
 * Decides whether the profile-create prompt should be shown for the ACTIVE place (site).
 *
 * Works on the relay/default cloud too: the active siteId is sourced the same way regardless of
 * cloud (web-core contextStore), so we do not gate on cloud type. Both `sid` and `uid` are needed
 * to key the profile (`${sid}@${uid}`); without them nothing is prompted.
 *
 * The decision is based SOLELY on getMyProfile(): a non-empty nick in the resolved profile means the
 * profile is set → prompt suppressed (`present`); an empty nick shows it (`absent`).
 *
 * TIMING — the check must run only once the site switch has fully COMMITTED. `selectedSiteId` flips
 * optimistically at click (before `auth.switch`), and getMyProfile() reads against that optimistic
 * context, so firing it mid-switch would verify the wrong (pre-commit) site. We therefore gate the
 * read on `settled = isVerified && !isSwitching` (the same idiom as useBackgroundSync): a switch
 * settles when its mutation resolves (`!isSwitching`) with the socket verified — at that instant the
 * optimistic sid IS the committed sid. `settled` is an effect dependency, so the read fires exactly
 * when the switch completes (or on the socket's verify rising edge on boot / cloud switch), never
 * against a transitional context. While unsettled we hold `unknown`, so the prompt never flashes.
 */
export const usePlaceProfilePrompt = () => {
    const { profile: profileRepository } = useRuntimeRepositories();
    const { selectedSiteId: sid } = useSessionSelection();
    const { userId: uid } = useSessionIdentity();
    const { isVerified } = useRuntimeSocketState();
    const skippedIds = usePreferenceStore(state => state.skippedPlaceProfileIds);
    const skipPlaceProfile = usePreferenceStore(state => state.skipPlaceProfile);

    // A site/cloud switch is triggered elsewhere, so its per-hook `isSwitching` is invisible here;
    // detect it globally via the switch mutation keys (mirrors useBackgroundSync).
    const isSwitching =
        useIsMutating({ mutationKey: SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: SWITCH_CLOUD_MUTATION_KEY }) >
        0;
    // The switch is fully committed to the new site once the socket is verified and no switch is
    // in flight — only then does getMyProfile() read against the committed context.
    const settled = isVerified && !isSwitching;

    const profileId = sid && uid ? `${sid}@${uid}` : null;
    const [status, setStatus] = useState<PromptStatus>('unknown');

    useEffect(() => {
        // Hold `unknown` until the switch settles, so we neither prompt nor read against a
        // transitional (optimistic, pre-commit) context.
        if (!profileId || !settled) {
            setStatus('unknown');
            return;
        }
        setStatus('unknown');

        let active = true;

        // Judge purely from getMyProfile(): nick present → no prompt, empty → prompt. It now runs
        // against the committed context (gated by `settled`), so the answer is authoritative.
        profileRepository
            .getMyProfile()
            .then(item => {
                if (!active) return;
                setStatus(hasNick(item) ? 'present' : 'absent');
            })
            .catch(() => {
                // A verified socket rarely rejects; treat a stray failure as inconclusive rather
                // than flashing the prompt. It re-reads on the next settle/context change.
                if (active) setStatus('unknown');
            });

        return () => {
            active = false;
        };
    }, [profileRepository, profileId, settled]);

    const shouldPrompt = status === 'absent' && !!sid && !skippedIds.includes(sid);

    const dismiss = () => {
        if (sid) skipPlaceProfile(sid);
    };

    return { shouldPrompt, activeSid: sid, dismiss };
};
