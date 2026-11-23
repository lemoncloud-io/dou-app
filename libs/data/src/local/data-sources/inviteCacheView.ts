import type { CacheInviteView } from '@chatic/bridge-messages';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

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
