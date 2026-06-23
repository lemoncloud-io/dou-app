import type { LocalDataSourcesV2 } from '../local/data-sources-v2';
import type { RemoteDataSources } from '../remote/data-sources';
import { ChannelRepositoryV2, type IChannelRepositoryV2 } from './ChannelRepositoryV2';
import { ChatRepositoryV2, type IChatRepositoryV2 } from './ChatRepositoryV2';
import { InviteCloudRepositoryV2, type IInviteCloudRepositoryV2 } from './InviteCloudRepositoryV2';
import { JoinRepositoryV2, type IJoinRepositoryV2 } from './JoinRepositoryV2';
import { ProfileRepositoryV2, type IProfileRepositoryV2 } from './ProfileRepositoryV2';
import { PlaceRepositoryV2, type IPlaceRepositoryV2 } from './PlaceRepositoryV2';
import { UserRepositoryV2, type IUserRepositoryV2 } from './UserRepositoryV2';
import type { DataContextProvider } from '../repositories';
import { createSnapshotDataContextProvider, type DataContext } from './types';

export * from './types';
export * from './ChannelRepositoryV2';
export * from './ChatRepositoryV2';
export * from './InviteCloudRepositoryV2';
export * from './JoinRepositoryV2';
export * from './ProfileRepositoryV2';
export * from './PlaceRepositoryV2';
export * from './UserRepositoryV2';

export interface DataRepositoriesV2 {
    channel: IChannelRepositoryV2;
    chat: IChatRepositoryV2;
    inviteCloud: IInviteCloudRepositoryV2;
    join: IJoinRepositoryV2;
    profile: IProfileRepositoryV2;
    place: IPlaceRepositoryV2;
    user: IUserRepositoryV2;
    withContext(context: DataContext): DataRepositoriesV2;
    dispose(): void;
}

const buildRepositories = (
    remoteDataSources: RemoteDataSources,
    localDataSources: LocalDataSourcesV2,
    context: DataContextProvider
): Omit<DataRepositoriesV2, 'withContext' | 'dispose'> => {
    return {
        channel: new ChannelRepositoryV2(remoteDataSources.channel, localDataSources.channel, context),
        chat: new ChatRepositoryV2(remoteDataSources.chat, localDataSources.chat, context),
        inviteCloud: new InviteCloudRepositoryV2(localDataSources.inviteCloud, context),
        join: new JoinRepositoryV2(remoteDataSources.join, localDataSources.join, context),
        profile: new ProfileRepositoryV2(remoteDataSources.profile, localDataSources.profile, context),
        place: new PlaceRepositoryV2(remoteDataSources.place, localDataSources.place, context),
        user: new UserRepositoryV2(remoteDataSources.user, localDataSources.user, context),
    };
};

export const createRepositoriesV2 = ({
    remoteDataSources,
    localDataSources,
    context,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSourcesV2;
    context: DataContextProvider;
}): DataRepositoriesV2 => {
    const repositories = buildRepositories(remoteDataSources, localDataSources, context);

    return {
        ...repositories,
        withContext(contextSnapshot: DataContext): DataRepositoriesV2 {
            return createRepositoriesV2({
                remoteDataSources,
                localDataSources,
                context: createSnapshotDataContextProvider(contextSnapshot),
            });
        },
        dispose() {
            repositories.channel.dispose();
            repositories.chat.dispose();
            repositories.inviteCloud.dispose();
            repositories.join.dispose();
            repositories.profile.dispose();
            repositories.place.dispose();
            repositories.user.dispose();
        },
    };
};
