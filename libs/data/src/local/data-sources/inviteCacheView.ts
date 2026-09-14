import type { CacheInviteView } from '@chatic/app-messages';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/**
 * Strips `code`/`deeplink` (and everything else this feature never reads) off a server invite
 * view before it reaches the cache. An **allowlist**, not a runtime delete off a full copy — a
 * delete-off-copy survives only until the next spread reintroduces the deleted keys (the chat
 * path once leaked exactly this way via `{...query}`), while an allowlist has no such hole: a
 * field only reaches the cache if it is named here.
 *
 * Scoped to what the sender-side invite UI actually reads (`useRelayInvites`, `ChannelList`,
 * `InviteChannelRow`, `InviteWaitingPage`, `useAcceptedChannelSync`, `useInviteCountdown`) plus
 * the display-only timestamps `MyInviteView` itself documents as such. `code`, `deeplink`,
 * `phone`, `hashPhone`, and every other credential/internal field are excluded by omission —
 * add a field here only when a caller needs it.
 */
export const toCacheInviteView = (view: MyInviteView, scope: { cid: string; uid: string }): CacheInviteView => ({
    id: view.id ?? '',
    cid: scope.cid,
    uid: scope.uid,
    name: view.name,
    state: view.state,
    channelId: view.channelId,
    cloudId: view.cloudId,
    cloudName: view.cloudName,
    inviterId: view.inviterId,
    mid: view.mid,
    last4: view.last4,
    expiredAt: view.expiredAt,
    canceledAt: view.canceledAt,
    rejectedAt: view.rejectedAt,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
});
