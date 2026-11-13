import { createUserGateway } from '@lemoncloud/chatic-sockets-lib';

import { runtime } from '@chatic/app-runtime';

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
 * partitioned by `${cid}:${uid}` and read under the live scope — so a relay row written while a cloud
 * is active is one the repositories will not read back, which is why the earlier data-layer attempt
 * at this was reverted (apps/web/docs/feature/place/relay-default-place-scoping.md §6). Reading the relay token instead of a cache is what makes the
 * app-level version work, so this gateway only ever moves data in and out of that token.
 *
 * Built once and reused: every request goes through `runtime.connection.requestOnSlot(RELAY_SLOT, …)`,
 * which resolves the relay slot on each call, so the instance survives relay slot teardown/rebuild
 * (transport docs/socket). A request THROWS when no relay slot is bound — callers must gate on
 * `useSlotVerified(RELAY_SLOT)` (or `waitUntilVerified(RELAY_SLOT)`) rather than firing hopefully,
 * same as `useRelayInvites`.
 *
 * The client handed to `createUserGateway` is only `request`, the one member the `user` gateway calls;
 * the cast is because the factory's parameter is typed as the full socket client.
 */
let cachedGateway: ReturnType<typeof createUserGateway> | null = null;

type UserGatewayClient = Parameters<typeof createUserGateway>[0];

export const getRelayAccountGateway = (): ReturnType<typeof createUserGateway> => {
    if (!cachedGateway) {
        const client: Pick<UserGatewayClient, 'request'> = {
            request: ((type: string, data?: unknown, options?: { timeoutMs?: number }) =>
                runtime.connection.requestOnSlot(
                    runtime.connection.RELAY_SLOT,
                    type,
                    data,
                    options
                )) as UserGatewayClient['request'],
        };
        cachedGateway = createUserGateway(client as UserGatewayClient);
    }
    return cachedGateway;
};

/** Test seam: drops the memoized gateway so a fresh runtime mock is picked up. */
export const resetRelayAccountGateway = (): void => {
    cachedGateway = null;
};
