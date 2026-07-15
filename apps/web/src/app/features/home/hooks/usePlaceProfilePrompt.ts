import { useEffect, useRef, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';
import { useSessionIdentity, useSessionSelection } from '@chatic/web-core';

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
 * Detection is driven by the observed profile cache (the same source the home header reads), not by
 * the raw getMyProfile() return, because a concurrent save/fetch could resolve with a stale value.
 * Three guards keep it race-safe:
 *  - Loading vs absent: `absent` is concluded ONLY after getMyProfile() RESOLVES (the authoritative
 *    "server has no profile for you here" answer). A rejected read is treated as transient — usually
 *    the socket is still connecting on boot (503) — so we retry and stay `unknown`, never flashing the
 *    prompt while the profile is still loading.
 *  - `present` is a per-place latch (`presentFor` ref): once this place has shown a filled nick we
 *    never fall back to `absent` for it again — even across effect re-runs or a late stale read that
 *    momentarily writes an empty profile to the cache. This is what stops the prompt from reappearing
 *    right after the user sets their profile.
 *  - observe short-circuit: a nick arriving via the cache (sync or our own save) latches `present`
 *    immediately, regardless of the fetch.
 */
const MAX_FETCH_ATTEMPTS = 6;
const RETRY_DELAY_MS = 800;

export const usePlaceProfilePrompt = () => {
    const { profile: profileRepository } = useRuntimeRepositories();
    const { selectedSiteId: sid } = useSessionSelection();
    const { userId: uid } = useSessionIdentity();
    const skippedIds = usePreferenceStore(state => state.skippedPlaceProfileIds);
    const skipPlaceProfile = usePreferenceStore(state => state.skipPlaceProfile);

    const profileId = sid && uid ? `${sid}@${uid}` : null;
    const [status, setStatus] = useState<PromptStatus>('unknown');
    // The profileId currently latched as `present`, so the latch is per-place and survives re-runs.
    const presentFor = useRef<string | null>(null);

    useEffect(() => {
        if (!profileId) {
            setStatus('unknown');
            return;
        }
        // Keep a prior `present` decision for this same place; only a new place starts at `unknown`.
        setStatus(presentFor.current === profileId ? 'present' : 'unknown');

        let active = true;
        // Freshest observed profile for this place (updated by the cache, incl. our own save).
        let latest: DomainProfile | null = null;
        let attempts = 0;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;

        const markPresent = () => {
            presentFor.current = profileId;
            if (active) setStatus('present');
        };

        // Observe the cache: a save (setMyProfile) or sync writes here and latches `present`.
        const unsubscribe = profileRepository.observeItem(profileId, profile => {
            latest = profile;
            if (hasNick(profile)) markPresent();
        });

        // Read the profile; only a SUCCESSFUL resolve is authoritative. The fetch's cache write fans
        // in through `observeItem` above, so we read `latest`, not the fetch's return value.
        const attempt = () => {
            profileRepository
                .getMyProfile()
                .then(() => {
                    if (!active) return;
                    if (presentFor.current === profileId || hasNick(latest)) markPresent();
                    else setStatus('absent');
                })
                .catch(() => {
                    if (!active) return;
                    // Transient read (socket still connecting / 503): retry, stay `unknown` — never
                    // flash the prompt while the profile might still be loading.
                    attempts += 1;
                    if (attempts < MAX_FETCH_ATTEMPTS) retryTimer = setTimeout(attempt, RETRY_DELAY_MS);
                });
        };
        attempt();

        return () => {
            active = false;
            clearTimeout(retryTimer);
            unsubscribe();
        };
    }, [profileRepository, profileId]);

    const shouldPrompt = status === 'absent' && !!sid && !skippedIds.includes(sid);

    const dismiss = () => {
        if (sid) skipPlaceProfile(sid);
    };

    return { shouldPrompt, activeSid: sid, dismiss };
};
