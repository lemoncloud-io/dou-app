import { useEffect, useState } from 'react';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainUser } from '@chatic/data';
import type { LinkedAccountsView } from '@lemoncloud/chatic-backend-api';
import { useSessionIdentity } from '@chatic/web-core';

/**
 * The domain user carries the backend display fields (`photo`/`email`) and the linked-credential slots
 * (`link$`) at runtime — via `toDomainUser`'s spread of the backend `$user` and the session seed — but
 * the socials-api `DomainUser` type only declares `name`/`nick`/`thumbnail`, so surface them
 * explicitly here.
 *
 * `link$` rides all the way through because every hop is a spread, not a field allowlist:
 * `UserRemoteDataSource` pulls `$user` out of `UserProfile$`, `toDomainUser` spreads it, and
 * `UserLocalDataSourceV2.cacheWrite` merges it into the IndexedDB row. Nothing declares it, so it is
 * invisible to the compiler until a reader widens the type — which is exactly what this alias does
 * for `photo`/`email` already (ADR-0042 §5).
 */
export type MyUser = DomainUser & { photo?: string; email?: string; link$?: LinkedAccountsView };

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
    const { isVerified } = useRuntimeSocketState();
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
        // Gated on the socket being verified for the same reason as useMyProfile:
        // an unconditional refresh here rejects with `503 SOCKET NOT CONNECTED`
        // whenever it beats the handshake, and the rejection is swallowed but
        // still logged. Re-runs when `isVerified` flips.
        if (isVerified) void user.getMyProfile().catch(() => undefined);
        return unsubscribe;
    }, [user, userId, isVerified]);

    return me;
};
