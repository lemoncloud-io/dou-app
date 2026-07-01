import { useEffect, useMemo, useState } from 'react';

import type { DomainUser } from '@chatic/data';
import { getActiveSessionUser, useGlobalSession, useSessionIdentity } from '@chatic/web-core';

import { useRuntimeRepositories } from './useRuntimeRepositories';

/**
 * The current session user's reactive facts. Higher-level policy (permissions) is derived in the app
 * layer from these — see apps/web's useUserPermissions. This hook stays layer-appropriate: app-runtime
 * provides the identity facts; the app decides what they mean.
 */
export interface SessionProfile {
    userRole: string | null;
    isGuest: boolean;
    /** Whether an active cloud session is attached (vs relay/default). */
    isCloudActive: boolean;
    userName: string;
    photo?: string;
}

// The cached user is the UserView (DomainUser). Its `userRole` / `userStatus` (and `photo`) are
// delivered at runtime but not declared on the socials-api UserView type, so surface them here —
// mirroring apps/web's MyUser. Guest-ness is read straight off `userRole === 'guest'`.
type SessionUserView = DomainUser & { userRole?: string; userStatus?: string; photo?: string };

/**
 * Reactive current-session profile (role / guest / cloud-active / name / photo).
 *
 * The session identity is state storage only — it no longer stores a profile. This hook tracks the
 * cached profile: it observes `user.observeItem(uid)` so a profile edit fans out to every reader.
 * The initial value is seeded SYNCHRONOUSLY from the active session token's user fields
 * (`getActiveSessionUser`) so guard logic never flashes on first paint before the cache emits.
 */
export const useSessionProfile = (): SessionProfile => {
    const { user } = useRuntimeRepositories();
    const identity = useSessionIdentity();
    const session = useGlobalSession();
    const uid = identity.userId ?? '';

    // Seed synchronously from the active session token; then track the cached UserView.
    const [cachedUser, setCachedUser] = useState<SessionUserView | null>(
        () => getActiveSessionUser() as SessionUserView | null
    );

    useEffect(() => {
        if (!uid) {
            setCachedUser(null);
            return;
        }
        return user.observeItem(uid, next => {
            if (next) setCachedUser(next as unknown as SessionUserView);
        });
    }, [user, uid]);

    const isCloudActive = session.cloud.isActive;

    return useMemo(() => {
        // The token seed always carries `userRole` ($user.userRole); the cached UserView may be a
        // partial row (e.g. a profile refresh that omits userRole). Resolve `userRole` field-by-field
        // — cached first, token seed as fallback — so guest-ness never flips off on a partial cache
        // row. Display fields (name/photo) prefer the cached value so profile edits fan out.
        const cached = cachedUser;
        const seed = getActiveSessionUser() as SessionUserView | null;
        const userRole = cached?.userRole ?? seed?.userRole ?? null;
        return {
            userRole,
            isGuest: userRole === 'guest',
            isCloudActive,
            userName: cached?.name || seed?.name || 'Unknown',
            photo: cached?.photo ?? seed?.photo,
        };
        // `identity` ref changes on any session/token change (useSyncExternalStore), so it captures
        // getActiveSessionUser() staleness as a dep without threading its (new each call) object.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cachedUser, identity, isCloudActive]);
};
