import type { LocalDataSources } from '../local/data-sources';
import type { SocketDataSources } from '../remote/socket-data-sources';
import type { HttpDataSources } from '../remote/http-data-sources';
import { AuthRepository, type IAuthRepository } from './AuthRepository';
import { ChannelRepository, type IChannelRepository } from './ChannelRepository';
import { ChatRepository, type IChatRepository } from './ChatRepository';
import { CloudRepository, type ICloudRepository } from './CloudRepository';
import { DeviceRepository, type IDeviceRepository } from './DeviceRepository';
import { InviteRepository, type IInviteRepository } from './InviteRepository';
import { JoinRepository, type IJoinRepository } from './JoinRepository';
import { ProfileRepository, type IProfileRepository } from './ProfileRepository';
import { ReportRepository, type IReportRepository } from './ReportRepository';
import { PlaceRepository, type IPlaceRepository } from './PlaceRepository';
import { SubscriptionRepository, type ISubscriptionRepository } from './SubscriptionRepository';
import { SyncMetaRepository, type ISyncMetaRepository } from './SyncMetaRepository';
import { UserRepository, type IUserRepository, type UserRepositoryOptions } from './UserRepository';
import type { DataContext, DataContextProvider } from './types';
import { createSnapshotDataContextProvider } from './types';

export * from './types';
export * from './AuthRepository';
export * from './ChannelRepository';
export * from './ChatRepository';
export * from './CloudRepository';
export * from './DeviceRepository';
export * from './InviteRepository';
export * from './JoinRepository';
export * from './ProfileRepository';
export * from './ReportRepository';
export * from './PlaceRepository';
export * from './SubscriptionRepository';
export * from './SyncMetaRepository';
export * from './UserRepository';

/** App-injected repository policies. Every field is optional — omitted means current behavior. */
export interface DataRepositoriesOptions {
    user?: UserRepositoryOptions;
}

export interface DataRepositories {
    auth: IAuthRepository;
    channel: IChannelRepository;
    chat: IChatRepository;
    cloud: ICloudRepository;
    device: IDeviceRepository;
    invite: IInviteRepository;
    join: IJoinRepository;
    profile: IProfileRepository;
    report: IReportRepository;
    place: IPlaceRepository;
    subscription: ISubscriptionRepository;
    user: IUserRepository;
    syncMeta: ISyncMetaRepository;
    withContext(context: DataContext): DataRepositories;
    dispose(): void;
}

const buildRepositories = (
    socketDataSources: SocketDataSources,
    localDataSources: LocalDataSources,
    context: DataContextProvider,
    options?: DataRepositoriesOptions,
    httpDataSources?: HttpDataSources
): Omit<DataRepositories, 'withContext' | 'dispose'> => {
    return {
        // auth/device take no local data source: they are remote-only access surfaces
        // (session-identity commands, viewing signals) with nothing to cache. `invite` (ADR-0052)
        // is local-first for reads of its own list but still has no cache slot for the other
        // command-shaped calls (create/accept/cancel/reject/get). `subscription` (ADR-0070 2단계
        // 후반) is remote-only too, and HTTP-only — it has no socket data source either.
        auth: new AuthRepository(socketDataSources.auth, context, httpDataSources?.auth),
        // `localDataSources.chat` so a leave can purge the room's messages, not just the channel
        // row — the cache is what the screen renders, so the server's rejoin cursor reset alone
        // changed nothing (ADR-0067).
        channel: new ChannelRepository(
            socketDataSources.channel,
            localDataSources.channel,
            localDataSources.chat,
            context
        ),
        chat: new ChatRepository(socketDataSources.chat, localDataSources.chat, context),
        cloud: new CloudRepository(socketDataSources.cloud, localDataSources.cloud, context, httpDataSources?.cloud),
        device: new DeviceRepository(socketDataSources.device, context, httpDataSources?.user),
        invite: new InviteRepository(socketDataSources.invite, localDataSources.invite, context),
        join: new JoinRepository(socketDataSources.join, localDataSources.join, context),
        profile: new ProfileRepository(socketDataSources.profile, localDataSources.profile, context),
        // Remote-only and HTTP-only like `subscription` — a report has nothing to cache.
        report: new ReportRepository(context, httpDataSources?.report),
        place: new PlaceRepository(socketDataSources.place, localDataSources.place, context),
        subscription: new SubscriptionRepository(context, httpDataSources?.subscription),
        user: new UserRepository(
            socketDataSources.user,
            localDataSources.user,
            localDataSources.join,
            localDataSources.place,
            context,
            options?.user,
            httpDataSources?.user
        ),
        syncMeta: new SyncMetaRepository(localDataSources.syncMeta, context),
    };
};

export const createRepositories = ({
    socketDataSources,
    localDataSources,
    context,
    options,
    httpDataSources,
}: {
    socketDataSources: SocketDataSources;
    localDataSources: LocalDataSources;
    context: DataContextProvider;
    options?: DataRepositoriesOptions;
    /** Optional through 2단계 — apps that haven't wired `httpFactory` yet omit this and every
     * existing call site stays green (ADR-0070 결정 5, libs/data/docs/http-data-path.md §범위). */
    httpDataSources?: HttpDataSources;
}): DataRepositories => {
    const repositories = buildRepositories(socketDataSources, localDataSources, context, options, httpDataSources);

    return {
        ...repositories,
        withContext(contextSnapshot: DataContext): DataRepositories {
            return createRepositories({
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
