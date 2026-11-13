import { createUserGateway } from '@lemoncloud/chatic-sockets-lib';

import { runtime } from '@chatic/app-runtime';

/**
 * `user.*` pinned to the RELAY slot, for the account-level profile (the
 * account hub and what it opens).
 *
 * The composed `user` gateway in app-runtime's socketFactory binds to the
 * ACTIVE facade, so `user.profile` / `user.update` follow the user into a
 * cloud and answer with the cloud-delegated record — a different uid on a
 * different backend. Account screens need the relay account regardless of the
 * active slot, so they talk to the relay slot directly.
 *
 * Deliberately NOT wired through a repository. Repositories cache, and the
 * cache is physically partitioned by `${cid}:${uid}` and read under the live
 * scope — so a relay row written while a cloud is active is one the
 * repositories will not read back. Reading the relay token instead of a cache
 * is what makes the app-level version work, so this gateway only ever moves
 * data in and out of that token.
 *
 * Built once and reused: every call goes through `requestOnSlot(RELAY_SLOT, …)`,
 * which resolves the slot when the request is made, so the instance survives
 * relay slot teardown/rebuild. It THROWS when no relay slot is bound — callers
 * must gate on `useSlotVerified(RELAY_SLOT)` rather than firing hopefully.
 *
 * The client handed to `createUserGateway` carries `request` only: that is the
 * one member the user gateway calls, while the factory's parameter is typed as
 * the full socket client — hence the cast.
 */
let cachedGateway: ReturnType<typeof createUserGateway> | null = null;

const relayClient = {
    request: (type: string, data?: unknown, options?: { timeoutMs?: number }) =>
        runtime.connection.requestOnSlot(runtime.connection.RELAY_SLOT, type, data, options),
};

export const getRelayAccountGateway = (): ReturnType<typeof createUserGateway> => {
    if (!cachedGateway) {
        cachedGateway = createUserGateway(relayClient as unknown as Parameters<typeof createUserGateway>[0]);
    }
    return cachedGateway;
};

/** Test seam: drops the memoized gateway between tests. */
export const resetRelayAccountGateway = (): void => {
    cachedGateway = null;
};
