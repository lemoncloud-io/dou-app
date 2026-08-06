import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainUser } from '@chatic/data';
import type { LinkedAccountsView } from '@lemoncloud/chatic-backend-api';
import { getRelaySessionUser, useGlobalSession, useSessionIdentity } from '@chatic/web-core';

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
 * The last account (relay) profile observed while the relay scope was active, held at module scope
 * so it survives cloud switches: the physical cache partition follows the ACTIVE context, so the
 * relay user row is unreadable while a cloud is active — pinning the display to the account profile
 * (ADR-0045) therefore means retaining the value in app memory. Keyed by uid so a logout/login as
 * someone else can never leak the previous account's profile.
 */
let heldRelayUser: { uid: string; user: MyUser } | null = null;

/**
 * Readers currently showing the RETAINED value (i.e. mounted while a cloud is active). They have no
 * cache subscription to fan a change in through, so a save has to be pushed to them directly.
 */
const retainedUserListeners = new Set<(user: MyUser) => void>();

/** Test hook: clears the module-scope relay profile between cases. */
export const resetHeldRelayUserForTest = (): void => {
    heldRelayUser = null;
};

const retainRelayUser = (uid: string, user: MyUser): void => {
    heldRelayUser = { uid, user };
    retainedUserListeners.forEach(notify => notify(user));
};

/** Relay-token profile seed for a cold start with a cloud selected (never-observed relay cache). */
const seedFromRelaySession = (uid: string): MyUser | null => {
    const seed = getRelaySessionUser();
    return seed ? ({ id: uid, ...seed } as MyUser) : null;
};

/**
 * Merges a just-saved ACCOUNT profile into the retained relay value and republishes it.
 *
 * Only matters while a cloud is active: `user.update` is pinned to the relay slot, but the local
 * cache partition follows the ACTIVE context, and a local read resolves against that partition's
 * storage — no context override reaches the relay row (the storage instance IS the partition). So
 * the retained value is the only place the new profile can land until the next relay connection
 * refreshes it. On the relay the observeItem fan-out already carries the change; calling this too
 * is a harmless no-op restatement of the same value.
 *
 * Undefined fields are dropped so an untouched field (e.g. a save that changed only the name) can
 * never blank out what is already retained.
 */
export const patchMyRelayUser = (uid: string, patch: Partial<MyUser>): void => {
    if (!uid) return;
    const base = heldRelayUser?.uid === uid ? heldRelayUser.user : seedFromRelaySession(uid);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    retainRelayUser(uid, { ...(base ?? {}), ...defined, id: uid } as MyUser);
};

/**
 * Current-session ACCOUNT user (name/photo/email) — pinned to the relay scope (ADR-0045). All four
 * consumers (MyPage / ProfileEditPage / WithdrawalPage / useLinkedAccounts) are account-level
 * screens, so a cloud switch must not swap this into the cloud profile.
 *
 * - Relay active: sourced from UserRepositoryV2 (the socket `user.profile` action), observed by id
 *   so a profile edit fans out to every reader; the emitted value is also retained module-wide.
 * - Cloud active: the retained relay value is shown as-is (falling back to the relay token's seed
 *   on a cold start). No observe — the active partition would answer with the CLOUD profile — and
 *   no fetch — a relay remote fetch is not guaranteed over a cloud-bound socket; the next relay
 *   connection refreshes it.
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
    const session = useGlobalSession();
    // The OPTIMISTIC selected cloud (the useHomePlaces idiom): the instant a switch pre-applies the
    // cid, this hook freezes onto the retained relay value instead of observing a partition that is
    // about to be (or already is) the cloud's.
    const isRelayActive = !session.cloud?.cloudId || session.cloud.cloudId === 'default';
    const [me, setMe] = useState<MyUser | null>(null);

    useEffect(() => {
        if (!userId) {
            setMe(null);
            return;
        }
        if (!isRelayActive) {
            const retained = heldRelayUser?.uid === userId ? heldRelayUser.user : null;
            setMe(retained ?? seedFromRelaySession(userId));
            // An account-profile save made from here writes to the relay, which this partition
            // cannot observe — subscribe to the retained value so the edit still shows up.
            const notify = (next: MyUser) => setMe(next);
            retainedUserListeners.add(notify);
            return () => {
                retainedUserListeners.delete(notify);
            };
        }
        // Subscribe first so the fetch's cache write (and background-sync refreshes) fan in. Keep the
        // last non-null value on a transient cache miss so the header never flashes empty.
        const unsubscribe = user.observeItem(userId, next => {
            if (next) {
                retainRelayUser(userId, next as MyUser);
                setMe(next as MyUser);
            }
        });
        void user.getMyProfile().catch(() => undefined);
        return unsubscribe;
    }, [user, userId, isRelayActive]);

    return me;
};
