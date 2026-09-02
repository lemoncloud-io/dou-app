import type { LocalDataSourcesV2 } from '../local/data-sources-v2';
import type { SocketDataSources } from '../remote/socket-data-sources';
import type { HttpDataSources } from '../remote/http-data-sources';
import { AuthRepositoryV2, type IAuthRepositoryV2 } from './AuthRepositoryV2';
import { ChannelRepositoryV2, type IChannelRepositoryV2 } from './ChannelRepositoryV2';
import { ChatRepositoryV2, type IChatRepositoryV2 } from './ChatRepositoryV2';
import { CloudRepositoryV2, type ICloudRepositoryV2 } from './CloudRepositoryV2';
import { DeviceRepositoryV2, type IDeviceRepositoryV2 } from './DeviceRepositoryV2';
import { InviteRepositoryV2, type IInviteRepositoryV2 } from './InviteRepositoryV2';
import { JoinRepositoryV2, type IJoinRepositoryV2 } from './JoinRepositoryV2';
import { ProfileRepositoryV2, type IProfileRepositoryV2 } from './ProfileRepositoryV2';
import { ReportRepositoryV2, type IReportRepositoryV2 } from './ReportRepositoryV2';
import { PlaceRepositoryV2, type IPlaceRepositoryV2 } from './PlaceRepositoryV2';
import { SubscriptionRepositoryV2, type ISubscriptionRepositoryV2 } from './SubscriptionRepositoryV2';
import { SyncMetaRepositoryV2, type ISyncMetaRepositoryV2 } from './SyncMetaRepositoryV2';
import { UserRepositoryV2, type IUserRepositoryV2, type UserRepositoryV2Options } from './UserRepositoryV2';
import type { DataContext, DataContextProvider } from './types';
import { createSnapshotDataContextProvider } from './types';

export * from './types';
export * from './AuthRepositoryV2';
export * from './ChannelRepositoryV2';
export * from './ChatRepositoryV2';
export * from './CloudRepositoryV2';
export * from './DeviceRepositoryV2';
export * from './InviteRepositoryV2';
export * from './JoinRepositoryV2';
export * from './ProfileRepositoryV2';
export * from './ReportRepositoryV2';
export * from './PlaceRepositoryV2';
export * from './SubscriptionRepositoryV2';
export * from './SyncMetaRepositoryV2';
export * from './UserRepositoryV2';

/** App-injected repository policies. Every field is optional — omitted means current behavior. */
export interface DataRepositoriesV2Options {
    user?: UserRepositoryV2Options;
}

export interface DataRepositoriesV2 {
    auth: IAuthRepositoryV2;
    channel: IChannelRepositoryV2;
    chat: IChatRepositoryV2;
    cloud: ICloudRepositoryV2;
    device: IDeviceRepositoryV2;
    invite: IInviteRepositoryV2;
    join: IJoinRepositoryV2;
    profile: IProfileRepositoryV2;
    report: IReportRepositoryV2;
    place: IPlaceRepositoryV2;
    subscription: ISubscriptionRepositoryV2;
    user: IUserRepositoryV2;
    syncMeta: ISyncMetaRepositoryV2;
    withContext(context: DataContext): DataRepositoriesV2;
    dispose(): void;
}

const buildRepositories = (
    socketDataSources: SocketDataSources,
    localDataSources: LocalDataSourcesV2,
    context: DataContextProvider,
    options?: DataRepositoriesV2Options,
    httpDataSources?: HttpDataSources
): Omit<DataRepositoriesV2, 'withContext' | 'dispose'> => {
    return {
        // auth/device take no local data source: they are remote-only access surfaces
        // (session-identity commands, viewing signals) with nothing to cache. `invite` (ADR-0052)
        // is local-first for reads of its own list but still has no cache slot for the other
        // command-shaped calls (create/accept/cancel/reject/get). `subscription` (ADR-0070 2단계
        // 후반) is remote-only too, and HTTP-only — it has no socket data source either.
        auth: new AuthRepositoryV2(socketDataSources.auth, context, httpDataSources?.auth),
        channel: new ChannelRepositoryV2(socketDataSources.channel, localDataSources.channel, context),
        chat: new ChatRepositoryV2(socketDataSources.chat, localDataSources.chat, context),
        cloud: new CloudRepositoryV2(socketDataSources.cloud, localDataSources.cloud, context, httpDataSources?.cloud),
        device: new DeviceRepositoryV2(socketDataSources.device, context, httpDataSources?.user),
        invite: new InviteRepositoryV2(socketDataSources.invite, localDataSources.invite, context),
        join: new JoinRepositoryV2(socketDataSources.join, localDataSources.join, context),
        profile: new ProfileRepositoryV2(socketDataSources.profile, localDataSources.profile, context),
        // Remote-only and HTTP-only like `subscription` — a report has nothing to cache.
        report: new ReportRepositoryV2(context, httpDataSources?.report),
        place: new PlaceRepositoryV2(socketDataSources.place, localDataSources.place, context),
        subscription: new SubscriptionRepositoryV2(context, httpDataSources?.subscription),
        user: new UserRepositoryV2(
            socketDataSources.user,
            localDataSources.user,
            localDataSources.join,
            localDataSources.place,
            context,
            options?.user,
            httpDataSources?.user
        ),
        syncMeta: new SyncMetaRepositoryV2(localDataSources.syncMeta, context),
    };
};

export const createRepositoriesV2 = ({
    socketDataSources,
    localDataSources,
    context,
    options,
    httpDataSources,
}: {
    socketDataSources: SocketDataSources;
    localDataSources: LocalDataSourcesV2;
    context: DataContextProvider;
    options?: DataRepositoriesV2Options;
    /** Optional through 2단계 — apps that haven't wired `httpFactory` yet omit this and every
     * existing call site stays green (ADR-0070 결정 5, libs/data/docs/http-data-path.md §범위). */
    httpDataSources?: HttpDataSources;
}): DataRepositoriesV2 => {
    const repositories = buildRepositories(socketDataSources, localDataSources, context, options, httpDataSources);

    return {
        ...repositories,
        withContext(contextSnapshot: DataContext): DataRepositoriesV2 {
            return createRepositoriesV2({
                socketDataSources,
                localDataSources,
                context: createSnapshotDataContextProvider(contextSnapshot),
                options,
                httpDataSources,
            });
        },
        dispose() {
            repositories.auth.dispose();
            repositories.channel.dispose();
            repositories.chat.dispose();
            repositories.cloud.dispose();
            repositories.device.dispose();
            repositories.invite.dispose();
            repositories.join.dispose();
            repositories.profile.dispose();
            repositories.report.dispose();
            repositories.place.dispose();
            repositories.subscription.dispose();
            repositories.user.dispose();
            repositories.syncMeta.dispose();
        },
    };
};
export * from './scopeGuards';
