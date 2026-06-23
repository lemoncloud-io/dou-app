import type { DomainSyncPlan } from '@lemoncloud/chatic-sockets-lib';
import { ChannelSyncPlan, DeviceSyncPlan, PlaceSyncPlan, ProfileSyncPlan } from '@lemoncloud/chatic-sockets-lib';
import type { DomainScope } from '@chatic/data';
import { toDomainChannel, toDomainPlace, toDomainProfile } from '@chatic/data';
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
    ];
};
