import type { DomainSyncPlan } from '@lemoncloud/chatic-sockets-lib';
import {
    ChannelSyncPlan,
    ChatSyncPlan,
    DeviceSyncPlan,
    JoinSyncPlan,
    PlaceSyncPlan,
    ProfileSyncPlan,
} from '@lemoncloud/chatic-sockets-lib';
import type { DomainScope } from '@chatic/data';
import { toDomainChannel, toDomainChat, toDomainJoin, toDomainPlace, toDomainProfile } from '@chatic/data';
import { getDataManager, getRepositories } from '../../data/runtime';

/**
 * Sync plans resolve runtime-heavy dependencies lazily so tests can inject
 * lightweight factories without loading the socket library at module scope.
 */
const getScope = (): DomainScope => {
    const context = getDataManager().getContext();
    return {
        cid: context.cid || 'default',
        sid: typeof context.sid === 'string' ? context.sid : undefined,
        uid: typeof context.uid === 'string' ? context.uid : undefined,
    };
};

export const createSyncPlans = (): DomainSyncPlan[] => {
    return [
        new DeviceSyncPlan(),
        new ChannelSyncPlan({
            onUpdate: (_target, view) => {
                const { channel } = getRepositories();
                void channel.cacheWrite(toDomainChannel(view, getScope()));
            },
            onRemove: target => {
                if (!target.id) return;
                const { channel } = getRepositories();
                void channel.cacheDelete(target.id);
            },
        }),
        new PlaceSyncPlan({
            onUpdate: (_target, view) => {
                const { place } = getRepositories();
                void place.cacheWrite(toDomainPlace(view, getScope()));
            },
            onRemove: target => {
                if (!target.id) return;
                const { place } = getRepositories();
                void place.cacheDelete(target.id);
            },
        }),
        new ProfileSyncPlan({
            onUpdate: (_target, view) => {
                const { profile } = getRepositories();
                void profile.cacheWrite(toDomainProfile(view, getScope()));
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
                if (!applied.length) return;
                const { chat } = getRepositories();
                const scope = getScope();
                void chat.cacheWriteMany(applied.map(view => toDomainChat(view, scope)));
            },
        }),
        // join은 single-join polling plan. join.get 응답의 updatedAt 변화 시 onUpdate가 호출되며,
        // read-state sync 소유권은 이 plan이 갖고 local cache 반영은 JoinRepositoryV2가 맡는다.
        new JoinSyncPlan({
            onUpdate: (_target, view) => {
                const { join } = getRepositories();
                void join.cacheWrite(toDomainJoin(view, getScope()));
            },
            onRemove: target => {
                if (!target.id) return;
                const { join } = getRepositories();
                void join.cacheDelete(target.id);
            },
        }),
    ];
};
