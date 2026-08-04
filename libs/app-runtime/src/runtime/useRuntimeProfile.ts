import { useEffect, useMemo, useState } from 'react';

import type { DomainUser } from '@chatic/data';
import { getActiveSessionUser, useGlobalSession } from '@chatic/web-core';

import type { SessionProfile } from './types';
import { useRuntimeRepositories } from './useRuntimeRepositories';

// The cached user is the UserView (DomainUser). Its `userRole` / `userStatus` (and `photo`) are
// delivered at runtime but not declared on the socials-api UserView type, so surface them here —
// mirroring apps/web's MyUser. Guest-ness is read straight off `userRole === 'guest'`.
type SessionUserView = DomainUser & { userRole?: string; userStatus?: string; photo?: string };

/**
 * Reactive current-session profile (role / guest / cloud-active / name / photo).
 *
 * Session-derived facts (`uid`, `isCloudActive`) are read straight from `useGlobalSession` (the
 * web-core session layer), not from a runtime hook. The session identity stores no profile; this
 * hook tracks the cached profile by observing `user.observeItem(uid)` so a profile edit fans out to
 * every reader. The initial value is seeded SYNCHRONOUSLY from the active session token's user fields
 * (`getActiveSessionUser`) so guard logic never flashes on first paint before the cache emits.
 */
export const useRuntimeProfile = (): SessionProfile => {
    const { user } = useRuntimeRepositories();
    const session = useGlobalSession();
    const uid = session.identity.userId ?? '';
    const isCloudActive = session.cloud.isActive;

    // Seed synchronously from the active session token; then track the cached UserView.
    const [cachedUser, setCachedUser] = useState<SessionUserView | null>(
        () => getActiveSessionUser() as SessionUserView | null
    );

    useEffect(() => {
        if (!uid) {
            setCachedUser(null);
            return;
        }
        // Drop whatever row we held before subscribing to THIS uid. `observeItem` only ever assigns a
        // truthy row, so without this a previous identity's cache would keep answering for the new one
        // until (and unless) a row for the new uid emits — and since `userRole` resolves cached-first,
        // a guest→main promotion would keep reporting `isGuest: true` forever. Falling back to the
        // token seed is safe: it describes the identity the session just switched to.
        setCachedUser(getActiveSessionUser() as SessionUserView | null);
        return user.observeItem(uid, next => {
            if (next) setCachedUser(next as unknown as SessionUserView);
        });
    }, [user, uid]);

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
        // `session` is a fresh object on any session/token change (useSyncExternalStore), so it
        // captures getActiveSessionUser() staleness — and the isCloudActive value read from it — as a
        // single dep without threading each field.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cachedUser, session]);
};
