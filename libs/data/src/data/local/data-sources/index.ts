import { ChannelLocalDataSource, type IChannelLocalDataSource } from './ChannelLocalDataSource';
import { ChatLocalDataSource, type IChatLocalDataSource } from './ChatLocalDataSource';
import { type IInviteCloudLocalDataSource, InviteCloudLocalDataSource } from './InviteCloudLocalDataSource';
import { type IJoinLocalDataSource, JoinLocalDataSource } from './JoinLocalDataSource';
import { type IProfileLocalDataSource, ProfileLocalDataSource } from './ProfileLocalDataSource';
import { type ISiteLocalDataSource, SiteLocalDataSource } from './SiteLocalDataSource';
import { type IUserLocalDataSource, UserLocalDataSource } from './UserLocalDataSource';
import type { CacheStorage } from '../storages';
import type { DataContextProvider } from '../../repositories';

export * from './types';
export * from './ChannelLocalDataSource';
export * from './ChatLocalDataSource';
export * from './InviteCloudLocalDataSource';
export * from './JoinLocalDataSource';
export * from './ProfileLocalDataSource';
export * from './SiteLocalDataSource';
export * from './UserLocalDataSource';

export interface LocalDataSources {
    channel: IChannelLocalDataSource;
    chat: IChatLocalDataSource;
    inviteCloud: IInviteCloudLocalDataSource;
    join: IJoinLocalDataSource;
    profile: IProfileLocalDataSource;
    site: ISiteLocalDataSource;
    user: IUserLocalDataSource;
}

export const createLocalDataSources = (
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
): LocalDataSources => ({
    channel: new ChannelLocalDataSource(contextProvider, storages.channel),
    chat: new ChatLocalDataSource(contextProvider, storages.chat),
    inviteCloud: new InviteCloudLocalDataSource(contextProvider, storages.inviteCloud),
    join: new JoinLocalDataSource(contextProvider, storages.join),
    profile: new ProfileLocalDataSource(contextProvider, storages.profile),
    site: new SiteLocalDataSource(contextProvider, storages.site),
    user: new UserLocalDataSource(contextProvider, storages.user),
});
