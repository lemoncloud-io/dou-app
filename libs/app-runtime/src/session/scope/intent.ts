import type { DataContext } from '@chatic/data';

import { getGlobalSessionContext } from '../store';

/**
 * The cache scope the session implies — `{cid, sid, uid}`.
 *
 * Moved here from `useRuntimeBinding`, which used to derive it on every session render and push it
 * into a holder through `DataManager.ensure` (ADR-0070 결정 7의 "의도 계산" 조각). The formula is
 * unchanged; what changes is WHEN consumers see it.
 *
 * **Why reading beats pushing.** The push landed in a React effect, so on a cloud switch the provider
 * still reported the PREVIOUS cid while descendant hooks were subscribing — an observer would register
 * under the stale scope and never receive the post-commit write (the rail stayed stale until a manual
 * refresh). apps/web works around that today by passing explicit `contextOverride` values, and both
 * hooks say so in their "SCOPE PINNING" comments (`useHomePlaces`, `useActiveCloudChannels`). Reading
 * the store directly removes the lag those workarounds exist to dodge; the overrides keep working
 * unchanged because they pass their own values.
 */
export const deriveIntent = (): DataContext => {
    const { activeServer, cloud, identity } = getGlobalSessionContext();

    // Cache scope follows the SELECTED cloud, not the committed one — a switch pre-applies the cid
    // optimistically so cid-scoped observers re-subscribe to the target's cache immediately. The
    // `committed` view (ActiveScope.committed) is what stays frozen through that window.
    const selectedCloudId = cloud?.cloudId ?? undefined;

    return {
        cid: selectedCloudId && selectedCloudId !== 'default' ? selectedCloudId : 'default',
        sid: activeServer.siteId ?? undefined,
        uid: identity.userId ?? undefined,
    };
};
