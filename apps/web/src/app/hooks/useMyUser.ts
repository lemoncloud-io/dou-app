import { useEffect, useMemo } from 'react';

import { useKindVerified } from '@chatic/app-runtime';
import type { DomainUser } from '@chatic/data';
import type { LinkedAccountsView, UserProfile$, UserView } from '@lemoncloud/chatic-backend-api';
import { getRelaySessionUser, patchRelaySessionUser, useGlobalSession } from '@chatic/web-core';

import { getRelayAccountGateway } from '../runtime/relayAccountGateway';

/**
 * The account profile as account screens read it. The socials-api `DomainUser` type only declares
 * `name`/`nick`/`thumbnail`, so the backend display fields (`photo`/`email`) and the linked-credential
 * slots (`link$`) are surfaced explicitly — they ride along because every hop is a spread, not a field
 * allowlist (ADR-0042 §5).
 */
export type MyUser = DomainUser & { photo?: string; email?: string; link$?: LinkedAccountsView };

/** Display fields a relay `user.profile` / `user.update` response may carry back into the token. */
const ACCOUNT_FIELDS = ['name', 'nick', 'photo', 'thumbnail', 'email', 'link$'] as const;

/**
 * The subset of a relay user view worth writing back into the relay token. Everything else in the
 * response (ids, timestamps, server bookkeeping) is either already in the token or none of the
 * display layer's business, and a blanket merge would let a slim response overwrite the auth carrier.
 * `undefined` fields are dropped so a response that simply omits a field cannot erase it; `null` is
 * kept, because that is the server actually saying "cleared".
 */
const accountFieldsOf = (view: UserView | undefined): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    if (!view) return patch;
    for (const field of ACCOUNT_FIELDS) {
        const value = (view as unknown as Record<string, unknown>)[field];
        if (value !== undefined) patch[field] = value;
    }
    return patch;
};

/**
 * Current ACCOUNT user (name/photo/email/link$) — always the RELAY account, never the cloud-delegated
 * one, whichever cloud is active.
 *
 * Sourced from the stored relay token rather than the user cache, and that is the whole design. A
 * cloud session mints a DIFFERENT uid on a different backend, and the local cache is physically keyed
 * `${type}:${cid}:${uid}:${id}` with a read path that ignores context overrides — so while a cloud is
 * active the relay `user` row simply cannot be read back. The earlier attempt to fix this inside the
 * data layer was reverted for exactly that reason (ADR-0045 decision 5, reverted 2026-08-06; see
 * apps/web/docs/feature/place/relay-default-place-scoping.md §6). The relay token has neither problem:
 * it is always present, always the relay account's, and it carries name/photo/email/link$.
 *
 * Reactivity comes from the session signal — `useGlobalSession` re-renders on every session change,
 * and the store hands back a fresh context object each time, so the token is re-read on token
 * refresh and on our own writes alike. There is no cache to invalidate and no flash window: the
 * first render already has the token's values.
 *
 * The one-shot `user.profile` refresh catches an edit made on another device. It is pinned to the
 * relay slot and gated on that slot being verified — the scoped client throws rather than falling
 * back, and firing before the relay handshake is what threw `503 SOCKET NOT CONNECTED` elsewhere in
 * the app (same gate as `useRelayInvites`). Its response is written back into the token, which is
 * what makes it visible: patching the token IS the update path.
 */
export const useMyUser = (): MyUser | null => {
    const isRelayVerified = useKindVerified('relay');
    // Re-read per session signal. The session store drops its cached context on every notify and
    // rebuilds a new object, so this identity change is the refresh trigger.
    const session = useGlobalSession();
    const me = useMemo(() => (getRelaySessionUser() as MyUser | null) ?? null, [session]);

    useEffect(() => {
        if (!isRelayVerified) return;
        let cancelled = false;
        // The call sits inside try/catch, not just a `.catch()` on the promise: the scoped client
        // resolves its slot OUTSIDE the promise chain and throws SYNCHRONOUSLY when the slot is
        // unbound (SocketManager.getScopedClient — deliberate, so an unbound slot can never fall back
        // silently). `isRelayVerified` makes that rare, not impossible: the slot can be torn down
        // between this render and this effect (a relay reconnect, a logout), and a synchronous throw
        // there escapes the effect and takes the screen down instead of just skipping a refresh. The
        // token value is already on screen, so skipping IS the recovery.
        void (async () => {
            try {
                const response = await getRelayAccountGateway().profile<UserProfile$>();
                if (cancelled) return;
                // `user.profile` answers with a UserProfile$ wrapper ($user + $site); tolerate a flat
                // user view, same as UserRemoteDataSource does. `$site` is deliberately ignored here —
                // this hook is the ACCOUNT profile, and the relay site store has its own owner.
                const view = (response?.$user ?? (response as unknown)) as UserView | undefined;
                const patch = accountFieldsOf(view);
                if (Object.keys(patch).length) patchRelaySessionUser(patch);
            } catch {
                // Nothing to do and nothing to say: a missed refresh leaves the token value standing.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isRelayVerified]);

    return me;
};
