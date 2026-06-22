import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { LocalDataSourcesV2 } from '../local/data-sources-v2';
import type { RemoteDataSources } from '../remote/data-sources';
import { ChannelRepositoryV2, type IChannelRepositoryV2 } from './ChannelRepositoryV2';
import { ChatRepositoryV2, type IChatRepositoryV2 } from './ChatRepositoryV2';
import { InviteCloudRepositoryV2, type IInviteCloudRepositoryV2 } from './InviteCloudRepositoryV2';
import { JoinRepositoryV2, type IJoinRepositoryV2 } from './JoinRepositoryV2';
import { ProfileRepositoryV2, type IProfileRepositoryV2 } from './ProfileRepositoryV2';
import { SiteRepositoryV2, type ISiteRepositoryV2 } from './SiteRepositoryV2';
import { UserRepositoryV2, type IUserRepositoryV2 } from './UserRepositoryV2';
import type { DataContextProviderV2 } from './types';

export * from './types';
export * from './ChannelRepositoryV2';
export * from './ChatRepositoryV2';
export * from './InviteCloudRepositoryV2';
export * from './JoinRepositoryV2';
export * from './ProfileRepositoryV2';
export * from './SiteRepositoryV2';
export * from './UserRepositoryV2';

export interface DataRepositoriesV2 {
    channel: IChannelRepositoryV2;
    chat: IChatRepositoryV2;
    inviteCloud: IInviteCloudRepositoryV2;
    join: IJoinRepositoryV2;
    profile: IProfileRepositoryV2;
    site: ISiteRepositoryV2;
    user: IUserRepositoryV2;
    dispose(): void;
}

export const createRepositoriesV2 = ({
    remoteDataSources,
    localDataSources,
    context,
    domainEventBus,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSourcesV2;
    context: DataContextProviderV2;
    domainEventBus: IEventBus<DomainEventMap>;
}): DataRepositoriesV2 => {
    const channel = new ChannelRepositoryV2(
        remoteDataSources.channel,
        localDataSources.channel,
        context,
        domainEventBus
    );
    const chat = new ChatRepositoryV2(remoteDataSources.chat, localDataSources.chat, context, domainEventBus);
    const inviteCloud = new InviteCloudRepositoryV2(localDataSources.inviteCloud, context, domainEventBus);
    const join = new JoinRepositoryV2(remoteDataSources.join, localDataSources.join, context, domainEventBus);
    const profile = new ProfileRepositoryV2(
        remoteDataSources.profile,
        remoteDataSources.user,
        localDataSources.profile,
        context,
        domainEventBus
    );
    const site = new SiteRepositoryV2(remoteDataSources.site, localDataSources.site, context, domainEventBus);
    const user = new UserRepositoryV2(remoteDataSources.user, localDataSources.user, context, domainEventBus);

    return {
        channel,
        chat,
        inviteCloud,
        join,
        profile,
        site,
        user,
        dispose() {
            channel.dispose();
            chat.dispose();
            inviteCloud.dispose();
            join.dispose();
            profile.dispose();
            site.dispose();
            user.dispose();
        },
    };
};
