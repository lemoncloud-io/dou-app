import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainUser } from '@chatic/data';
import { useSessionIdentity } from '@chatic/web-core';

/**
 * The domain user carries the backend display fields (`photo`/`email`) at runtime — via
 * `toDomainUser`'s spread of the backend `$user` and the session seed — but the socials-api
 * `DomainUser` type only declares `name`/`nick`/`thumbnail`, so surface them explicitly here.
 */
export type MyUser = DomainUser & { photo?: string; email?: string };

/**
 * Current-session user (name/photo/email) sourced from UserRepositoryV2 (the socket `user.profile`
 * action), observed by id so a profile edit fans out to every reader.
 *
 * The session's `activeSession` is treated as state storage only: it supplies the `uid`, and the
 * actual profile display data is read through `user.observeItem(uid)`. observeItem emits the
 * current cached value on subscribe, so a login-time user-cache seed (not activeSession) is where a
 * flash-free first paint belongs. Identity facts (userId / userType / isGuest / permissions) still
 * come from the session — they are token-derived, not profile display data.
 */
export const useMyUser = (): MyUser | null => {
    const { user } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();
    const [me, setMe] = useState<MyUser | null>(null);

    useEffect(() => {
        if (!userId) {
            setMe(null);
            return;
        }
        // Subscribe first so the fetch's cache write (and background-sync refreshes) fan in. Keep the
        // last non-null value on a transient cache miss so the header never flashes empty.
        const unsubscribe = user.observeItem(userId, next => {
            if (next) setMe(next as MyUser);
        });
        void user.getMyProfile().catch(() => undefined);
        return unsubscribe;
    }, [user, userId]);

    return me;
};
