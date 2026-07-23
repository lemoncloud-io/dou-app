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
 * The decision comes from getMyProfile(), but is only trusted when the response is FOR the site we
 * asked about (`item.sid === requestedSid`) — a stale/transitional-context response is discarded
 * (`unknown`) so a present profile is never misjudged absent. The verdict is asymmetric: a nick
 * alone means `present` (that is the "profile set" signal), while `absent` is doubly confirmed
 * against the server contract (no nick + active:false) since it opens the mandatory prompt; an
 * inconclusive response stays `unknown`. Profile setup is MANDATORY — there is no skip/dismiss path,
 * so the prompt stays until a profile is created. `status` is exposed so callers can act on the
 * resolved state (e.g. the invite flow navigating to its pending channel once the profile is present).
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
        // Capture the site we are asking about; the response must be for THIS site to be trusted.
        const requestedSid = sid;

        // Judge from getMyProfile(), but only when the response is for the requested site. `settled`
        // gates the read to the committed context, yet an isVerified rising edge (boot/reconnect/
        // cloud switch) can still fire it a beat before the server-side site context lands — that
        // read returns a profile for a transitional/stale site. We detect it via
        // `item.sid !== requestedSid` and hold `unknown` (re-reads on the next settle) so a present
        // profile is never misjudged absent.
        //
        // The verdict is ASYMMETRIC: a nick IS the "profile set" signal, so `hasNick` alone means
        // present (callers such as the invite flow navigate on `present`; gating that on active:true
        // too could strand them if a profiled site ever omits `active`). Absence is the risky
        // direction — it opens the mandatory prompt — so it is doubly confirmed against the server
        // contract (absent ⇒ no nick + active:false); a no-nick response that is not explicitly
        // active:false stays `unknown` rather than risking a false prompt.
        profileRepository
            .getMyProfile()
            .then(item => {
                if (!active) return;
                if (!item || item.sid !== requestedSid) {
                    setStatus('unknown');
                    return;
                }
                if (hasNick(item)) setStatus('present');
                else if (item.active === false) setStatus('absent');
                else setStatus('unknown');
            })
            .catch(() => {
                // A verified socket rarely rejects; treat a stray failure as inconclusive rather
                // than flashing the prompt. It re-reads on the next settle/context change.
                if (active) setStatus('unknown');
            });

        return () => {
            active = false;
        };
    }, [profileRepository, profileId, settled, sid]);

    // Mandatory: no skip path — the prompt shows whenever the active site has no profile yet.
    const shouldPrompt = status === 'absent' && !!sid;

    return { shouldPrompt, status };
};
