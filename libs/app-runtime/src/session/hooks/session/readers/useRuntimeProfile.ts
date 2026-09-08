import { useEffect, useMemo, useState } from 'react';

import type { DomainUser } from '@chatic/data';
// Concrete paths, not the session barrel: the barrel PUBLISHES this hook (facade group `session`),
// so importing it back here would be a cycle. Reaching a sibling's internals by concrete path is
// the convention this package already states (session/index.ts's header).
import { getActiveSessionUser } from '../../../store';
import { useGlobalSession } from './useGlobalSession';

import { useRuntimeRepositories } from '../../../../data/hooks/useRuntimeRepositories';

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
/**
 * The current session user's reactive facts. Higher-level policy (permissions) is derived in the app
 * layer from these — see apps/web's useUserPermissions. This stays layer-appropriate: app-runtime
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
