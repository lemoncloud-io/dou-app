import { createUserGateway } from '@lemoncloud/chatic-sockets-lib';

import { getSocketManager } from '@chatic/app-runtime';

/**
 * `user.*` pinned to the RELAY slot, for the account-level profile (MY page and what it opens).
 *
 * The composed `user` gateway in app-runtime's socketFactory binds to the ACTIVE facade, so
 * `user.profile` / `user.update` follow the user into a cloud and answer with the cloud-delegated
 * record — a different uid on a different backend (libs/web-core session services: the cloud token
 * is minted by `POST {cloudBackend}/oauth/exchange-token`). Account screens need the relay account
 * regardless of the active slot, so they talk to the relay slot directly.
 *
 * Deliberately NOT wired through a repository. Repositories cache, and the cache is physically
 * partitioned by `${cid}:${uid}` with a read path that ignores context overrides — so a relay row
 * written while a cloud is active is unreachable, which is exactly why the earlier data-layer
 * attempt at this was reverted (ADR-0045 decision 5; apps/web/docs/feature/place/
 * relay-default-place-scoping.md §6). Reading the relay token instead of a cache is what makes the
 * app-level version work, so this gateway only ever moves data in and out of that token.
 *
 * Built once and reused: `getScopedClient` resolves its slot lazily on every call, so the instance
 * survives relay slot teardown/rebuild (app-runtime socket/kind-scoped-routing.md). It THROWS when
 * no relay slot is bound — callers must gate on `useKindVerified('relay')` (or
 * `waitUntilKindVerified`) rather than firing hopefully, same as `useRelayInvites`.
 *
 * The `as any` on the scoped client mirrors socketFactory: `ScopedSocketClient` is the request/send
 * subset the gateways actually use, but the factory's parameter is typed as the full client.
 */
let cachedGateway: ReturnType<typeof createUserGateway> | null = null;

export const getRelayAccountGateway = (): ReturnType<typeof createUserGateway> => {
    if (!cachedGateway) {
        cachedGateway = createUserGateway(getSocketManager().getScopedClient('relay') as any);
    }
    return cachedGateway;
};

/** Test seam: drops the memoized gateway so a fresh socket manager mock is picked up. */
export const resetRelayAccountGateway = (): void => {
    cachedGateway = null;
};
