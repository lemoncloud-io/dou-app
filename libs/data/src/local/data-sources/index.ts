import type { DataContextProvider } from '../../repositories/types';
import type { CacheStorage } from '../ports';
import { ChannelLocalDataSource, type IChannelLocalDataSource } from './ChannelLocalDataSource';
import { ChatLocalDataSource, type IChatLocalDataSource } from './ChatLocalDataSource';
import { CloudLocalDataSource, type ICloudLocalDataSource } from './CloudLocalDataSource';
import { InviteLocalDataSource, type IInviteLocalDataSource } from './InviteLocalDataSource';
import { JoinLocalDataSource, type IJoinLocalDataSource } from './JoinLocalDataSource';
import { ProfileLocalDataSource, type IProfileLocalDataSource } from './ProfileLocalDataSource';
import { PlaceLocalDataSource, type IPlaceLocalDataSource } from './PlaceLocalDataSource';
import { SyncMetaLocalDataSource, type ISyncMetaLocalDataSource } from './SyncMetaLocalDataSource';
import { UserLocalDataSource, type IUserLocalDataSource } from './UserLocalDataSource';

export * from './types';
export * from './ChannelLocalDataSource';
export * from './ChatLocalDataSource';
export * from './CloudLocalDataSource';
export * from './InviteLocalDataSource';
export * from './JoinLocalDataSource';
export * from './ProfileLocalDataSource';
export * from './PlaceLocalDataSource';
export * from './SyncMetaLocalDataSource';
export * from './UserLocalDataSource';

export interface LocalDataSources {
    channel: IChannelLocalDataSource;
    chat: IChatLocalDataSource;
    cloud: ICloudLocalDataSource;
    invite: IInviteLocalDataSource;
    join: IJoinLocalDataSource;
    profile: IProfileLocalDataSource;
    place: IPlaceLocalDataSource;
    user: IUserLocalDataSource;
    syncMeta: ISyncMetaLocalDataSource;
}

export const createLocalDataSources = (
    contextProvider: DataContextProvider,
    storages: {
        channel: CacheStorage<'channel'>;
        chat: CacheStorage<'chat'>;
        inviteCloud: CacheStorage<'invitecloud'>;
        invite: CacheStorage<'invite'>;
        join: CacheStorage<'join'>;
        profile: CacheStorage<'profile'>;
        site: CacheStorage<'site'>;
        user: CacheStorage<'user'>;
        meta: CacheStorage<'meta'>;
    },
    options?: {
        /**
         * Identifies the storage routing `storages` were built under, stamped onto sync cursors so
         * one written against a different routing cannot be trusted (ADR-0053). Only the assembler
         * knows this — it is the layer that resolved the routing in the first place.
         */
        routingFingerprint?: string;
    }
): LocalDataSources => ({
    channel: new ChannelLocalDataSource(contextProvider, storages.channel),
    chat: new ChatLocalDataSource(contextProvider, storages.chat),
    cloud: new CloudLocalDataSource(contextProvider, storages.inviteCloud),
    invite: new InviteLocalDataSource(contextProvider, storages.invite),
    join: new JoinLocalDataSource(contextProvider, storages.join),
    profile: new ProfileLocalDataSource(contextProvider, storages.profile),
    place: new PlaceLocalDataSource(contextProvider, storages.site),
    user: new UserLocalDataSource(contextProvider, storages.user),
    syncMeta: new SyncMetaLocalDataSource(contextProvider, storages.meta, options?.routingFingerprint),
});
