import type { DomainSyncPlan } from '@lemoncloud/chatic-sockets-lib';
import {
    ChannelSyncPlan,
    ChatSyncPlan,
    JoinSyncPlan,
    PlaceSyncPlan,
    ProfileSyncPlan,
} from '@lemoncloud/chatic-sockets-lib';
import { toDomainChannel, toDomainChat, toDomainJoin, toDomainPlace, toDomainProfile } from '@chatic/data';
import { isCloudSwitchInFlight } from '@chatic/web-core';
import { getDataManager, getRepositories } from '../../data/runtime';
import { getSocketManager } from '../runtime';
import type { ChannelView, ProfileView } from '@lemoncloud/chatic-socials-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

/**
 * Sync plans resolve runtime-heavy dependencies lazily so tests can inject
 * lightweight factories without loading the socket library at module scope.
 *
 * Domain mappers consume the shared DataContext directly (cid/sid/uid live on
 * it), so we read it straight from the manager instead of projecting a separate
 * scope object.
 */
const getContext = () => getDataManager().getContext();

// Drop socket-driven cache mutations from a frame that does NOT belong to the active cloud.
//
// A cloud switch flips the cache cid to the target optimistically, but the socket only rebinds
// to the target cloud once its wss changes (after the token exchange commits). Until then — and
// indefinitely if the target's exchange wedges — the OUTGOING cloud's socket stays attached and
// keeps delivering channel/chat/place frames; written under the live (target) cid they poison
// the target partition, and the sidebar oscillates as the target's own refreshList prunes them.
// getBoundCid() is the cloud the attached socket was actually bound to (frozen at bind, only
// advanced on a real rebind), so a mismatch with the live cache cid means this frame is from a
// socket that outlived its cloud — drop it. isCloudSwitchInFlight covers the brief window before
// boundCid is meaningful (the switch mutation itself).
const dropForeignFrame = (): boolean => {
    if (isCloudSwitchInFlight()) return true;
    const boundCid = getSocketManager().getBoundCid();
    const cacheCid = getContext().cid || 'default';
    return boundCid != null && boundCid !== cacheCid;
};

// DeviceSyncPlan is no longer created here: createDeviceRuntime injects its own
// DeviceSyncPlan and owns device save, so these plans are passed as `extraSyncPlans`.
export const createSyncPlans = (): DomainSyncPlan[] => {
    return [
        new ChannelSyncPlan<ChannelView>({
            onUpdate: (_target, view) => {
                if (dropForeignFrame()) return;
                const { channel } = getRepositories();
                void channel.cacheWrite(toDomainChannel(view, getContext()));
            },
            onRemove: target => {
                if (!target.id) return;
                const { channel } = getRepositories();
                void channel.cacheDelete(target.id);
            },
        }),
        // Place sync targets emit MySiteView payloads; parameterize the plan so
        // onUpdate's view matches toDomainPlace's input instead of the default
        // bare SyncableView (id/updatedAt only).
        new PlaceSyncPlan<MySiteView>({
            onUpdate: (_target, view) => {
                if (dropForeignFrame()) return;
                const { place } = getRepositories();
                void place.cacheWrite(toDomainPlace(view, getContext()));
            },
            onRemove: target => {
                if (!target.id) return;
                const { place } = getRepositories();
                void place.cacheDelete(target.id);
            },
        }),
        new ProfileSyncPlan<ProfileView>({
            onUpdate: (_target, view) => {
                if (dropForeignFrame()) return;
                const { profile } = getRepositories();
                void profile.cacheWrite(toDomainProfile(view, getContext()));
            },
            onRemove: target => {
                if (!target.id) return;
                const { profile } = getRepositories();
                void profile.cacheDelete(target.id);
            },
        }),
        // chat은 append-only event-driven plan. onApply가 적용된 메시지 델타(오름차순)를
        // 넘기므로 chatNo 기준 idempotent 머지를 위해 cacheWriteMany로 일괄 반영한다.
        // onRemove는 두지 않는다 — chat plan은 자동 stop되지 않고, 메시지 이력은 lazy-load/오프라인을 위해 유지한다.
        new ChatSyncPlan({
            onApply: (_target, applied) => {
                if (dropForeignFrame()) return;
                if (!applied.length) return;
                const { chat } = getRepositories();
                const scope = getContext();
                void chat.cacheWriteMany(applied.map(view => toDomainChat(view, scope)));
            },
        }),
        // join은 single-join polling plan. join.get 응답의 updatedAt 변화 시 onUpdate가 호출되며,
        // read-state sync 소유권은 이 plan이 갖고 local cache 반영은 JoinRepositoryV2가 맡는다.
        new JoinSyncPlan({
            onUpdate: (_target, view) => {
                if (dropForeignFrame()) return;
                const { join } = getRepositories();
                void join.cacheWrite(toDomainJoin(view, getContext()));
            },
            onRemove: target => {
                //TODO: Join 플랜 적용 개선필요
            },
        }),
    ];
};
