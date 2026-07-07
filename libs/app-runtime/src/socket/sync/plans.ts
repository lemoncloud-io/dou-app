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

// During a cloud switch the cache cid is flipped to the target cloud optimistically while
// the outgoing cloud's socket is still delivering frames — writing those under the new cid
// poisons the target partition (the previous cloud's channels flash after the switch). Drop
// socket-driven cache mutations while the switch is committing; the target cloud's own sync
// repopulates it correctly once the switch lands.
const dropDuringSwitch = (): boolean => isCloudSwitchInFlight();

// DeviceSyncPlan is no longer created here: createDeviceRuntime injects its own
// DeviceSyncPlan and owns device save, so these plans are passed as `extraSyncPlans`.
export const createSyncPlans = (): DomainSyncPlan[] => {
    return [
        new ChannelSyncPlan<ChannelView>({
            onUpdate: (_target, view) => {
                if (dropDuringSwitch()) return;
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
                if (dropDuringSwitch()) return;
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
                if (dropDuringSwitch()) return;
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
                if (dropDuringSwitch()) return;
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
                if (dropDuringSwitch()) return;
                const { join } = getRepositories();
                void join.cacheWrite(toDomainJoin(view, getContext()));
            },
            onRemove: target => {
                //TODO: Join 플랜 적용 개선필요
            },
        }),
    ];
};
