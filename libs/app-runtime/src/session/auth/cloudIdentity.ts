import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';

import { cloudStore } from '../store/stores';

/**
 * The uid a cloud token identifies — the same derivation `buildIdentityContext` uses for the active
 * token, so the identity recorded per cloud is the one the cache partitions under.
 */
const uidOf = (token: UserTokenView): string | null => {
    const view = token as { uid?: string; id?: string };
    return view.uid ?? view.id ?? null;
};

/**
 * Remembers which uid this account has in `cloudId`, from the token that just named it. Every path
 * that mints or refreshes a cloud token calls this, so the identity map is never behind the token —
 * and it outlives the token, which is the point (see `CLOUD_IDENTITIES_KEY` in the store).
 *
 * Its own module, and a small one, because both writers need it: `cloudTokens` (issue) reaches the
 * data runtime for the exchange, and `sessionAuthAdapter` (writeback) must not — that adapter sits
 * under the socket layer, and pulling the data runtime in through it would close a cycle.
 */
export const recordCloudIdentity = (cloudId: string, cloudToken: UserTokenView): void => {
    const uid = uidOf(cloudToken);
    if (!uid) {
        logger.warn('SESSION', '[cloudIdentity] cloud token carries no uid — identity not recorded', {
            data: { cloudId },
        });
        return;
    }
    cloudStore.setCloudIdentity(cloudId, { uid });
};
