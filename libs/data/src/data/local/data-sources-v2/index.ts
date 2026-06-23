import type { DataContextProvider } from '../../repositories';
import type { CacheStorage } from '../storages';
import { ChannelLocalDataSourceV2, type IChannelLocalDataSourceV2 } from './ChannelLocalDataSourceV2';
import { ChatLocalDataSourceV2, type IChatLocalDataSourceV2 } from './ChatLocalDataSourceV2';
import { CloudLocalDataSourceV2, type ICloudLocalDataSourceV2 } from './CloudLocalDataSourceV2';
import { JoinLocalDataSourceV2, type IJoinLocalDataSourceV2 } from './JoinLocalDataSourceV2';
import { ProfileLocalDataSourceV2, type IProfileLocalDataSourceV2 } from './ProfileLocalDataSourceV2';
import { PlaceLocalDataSourceV2, type IPlaceLocalDataSourceV2 } from './PlaceLocalDataSourceV2';
import { UserLocalDataSourceV2, type IUserLocalDataSourceV2 } from './UserLocalDataSourceV2';

export * from './types';
export * from './ChannelLocalDataSourceV2';
export * from './ChatLocalDataSourceV2';
export * from './CloudLocalDataSourceV2';
export * from './JoinLocalDataSourceV2';
export * from './ProfileLocalDataSourceV2';
export * from './PlaceLocalDataSourceV2';
export * from './UserLocalDataSourceV2';

export interface LocalDataSourcesV2 {
    channel: IChannelLocalDataSourceV2;
    chat: IChatLocalDataSourceV2;
    cloud: ICloudLocalDataSourceV2;
    join: IJoinLocalDataSourceV2;
    profile: IProfileLocalDataSourceV2;
    place: IPlaceLocalDataSourceV2;
    user: IUserLocalDataSourceV2;
}

export const createLocalDataSourcesV2 = (
    contextProvider: DataContextProvider,
    storages: {
        channel: CacheStorage<'channel'>;
        chat: CacheStorage<'chat'>;
        inviteCloud: CacheStorage<'invitecloud'>;
        join: CacheStorage<'join'>;
        profile: CacheStorage<'profile'>;
        site: CacheStorage<'site'>;
        user: CacheStorage<'user'>;
    }
): LocalDataSourcesV2 => ({
    channel: new ChannelLocalDataSourceV2(contextProvider, storages.channel),
    chat: new ChatLocalDataSourceV2(contextProvider, storages.chat),
    cloud: new CloudLocalDataSourceV2(contextProvider, storages.inviteCloud),
    join: new JoinLocalDataSourceV2(contextProvider, storages.join),
    profile: new ProfileLocalDataSourceV2(contextProvider, storages.profile),
    place: new PlaceLocalDataSourceV2(contextProvider, storages.site),
    user: new UserLocalDataSourceV2(contextProvider, storages.user),
});
