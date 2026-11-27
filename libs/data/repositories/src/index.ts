import type { HttpDataSources, SocketDataSources } from '@chatic/data-api';
import {
    createImmediateTransport,
    createStateOutbox,
    type LocalDataSources,
    type OutboxPort,
} from '@chatic/data-local';
import { AuthRepository, type IAuthRepository } from './AuthRepository';
import { ChannelRepository, type IChannelRepository } from './ChannelRepository';
import { ChatRepository, type IChatRepository } from './ChatRepository';
import { CloudRepository, type ICloudRepository } from './CloudRepository';
import { DeviceRepository, type IDeviceRepository } from './DeviceRepository';
import { InviteRepository, type IInviteRepository } from './InviteRepository';
import { JoinRepository, type IJoinRepository } from './JoinRepository';
import { PairingRepository, type IPairingRepository } from './PairingRepository';
import { ProfileRepository, type IProfileRepository } from './ProfileRepository';
import { ReportRepository, type IReportRepository } from './ReportRepository';
import { PlaceRepository, type IPlaceRepository } from './PlaceRepository';
import { SubscriptionRepository, type ISubscriptionRepository } from './SubscriptionRepository';
import { SyncMetaRepository, type ISyncMetaRepository } from './SyncMetaRepository';
import { WebhookRepository, type IWebhookRepository } from './WebhookRepository';
import { UserRepository, type IUserRepository, type UserRepositoryOptions } from './UserRepository';
import type { DataContext, DataContextProvider } from './types';
import { createSnapshotDataContextProvider } from './types';
import { STATE_SPECS } from './outbox/joinStates';

export * from './types';
export * from './AuthRepository';
export * from './ChannelRepository';
export * from './ChatRepository';
export { uncoveredIn } from './feedCoverage';
export type { FeedRange } from './feedCoverage';
export * from './CloudRepository';
export * from './DeviceRepository';
export * from './InviteRepository';
export * from './JoinRepository';
export * from './PairingRepository';
export * from './ProfileRepository';
export * from './ReportRepository';
export * from './PlaceRepository';
export * from './SubscriptionRepository';
export * from './SyncMetaRepository';
export * from './UserRepository';
export * from './WebhookRepository';

export interface DataRepositoriesOptions {
    user?: UserRepositoryOptions;
    outbox?: OutboxPort;
}

export interface DataRepositories {
    auth: IAuthRepository;
    channel: IChannelRepository;
    chat: IChatRepository;
    cloud: ICloudRepository;
    device: IDeviceRepository;
    invite: IInviteRepository;
    join: IJoinRepository;
    pairing: IPairingRepository;
    profile: IProfileRepository;
    report: IReportRepository;
    place: IPlaceRepository;
    subscription: ISubscriptionRepository;
    user: IUserRepository;
    webhook: IWebhookRepository;
    syncMeta: ISyncMetaRepository;
    withContext(context: DataContext): DataRepositories;
    dispose(): void;
}

const buildRepositories = (
    socketDataSources: SocketDataSources,
    localDataSources: LocalDataSources,
    context: DataContextProvider,
    options: DataRepositoriesOptions | undefined,
    httpDataSources: HttpDataSources | undefined,
    graph: () => DataRepositories
): Omit<DataRepositories, 'withContext' | 'dispose'> => {
    const profile = new ProfileRepository(socketDataSources.profile, localDataSources.profile, context);
    const channel = new ChannelRepository(
        socketDataSources.channel,
        localDataSources.channel,
        localDataSources.chat,
        context
    );
    const outbox =
        options?.outbox ?? createStateOutbox({ specs: STATE_SPECS, transport: createImmediateTransport(graph) });
    return {
        auth: new AuthRepository(socketDataSources.auth, context, httpDataSources?.auth),
        channel,
        chat: new ChatRepository(socketDataSources.chat, localDataSources.chat, context, socketDataSources.upload),
        cloud: new CloudRepository(
            socketDataSources.cloud,
            localDataSources.cloud,
            context,
            httpDataSources?.cloud,
            socketDataSources.miniApp
        ),
        device: new DeviceRepository(socketDataSources.device, context),
        invite: new InviteRepository(socketDataSources.invite, localDataSources.invite, context),
        join: new JoinRepository(socketDataSources.join, localDataSources.join, context, outbox),
        pairing: new PairingRepository(context, httpDataSources?.pairing),
        profile,
        report: new ReportRepository(context, httpDataSources?.report),
        place: new PlaceRepository(socketDataSources.place, localDataSources.place, context, channel),
        subscription: new SubscriptionRepository(context, httpDataSources?.subscription),
        user: new UserRepository(
            socketDataSources.user,
            localDataSources.user,
            localDataSources.join,
            localDataSources.place,
            context,
            options?.user,
            httpDataSources?.user,
            profile
        ),
        webhook: new WebhookRepository(socketDataSources.webhook, context),
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
    httpDataSources?: HttpDataSources;
}): DataRepositories => {
    let graph: DataRepositories | null = null;
    const repositories = buildRepositories(
        socketDataSources,
        localDataSources,
        context,
        options,
        httpDataSources,
        () => {
            if (!graph) throw new Error('[repositories] graph used before it was built');
            return graph;
        }
    );

    graph = {
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
            repositories.pairing.dispose();
            repositories.profile.dispose();
            repositories.report.dispose();
            repositories.place.dispose();
            repositories.subscription.dispose();
            repositories.user.dispose();
            repositories.webhook.dispose();
            repositories.syncMeta.dispose();
        },
    };
    return graph;
};
export * from './scopeGuards';
export * from './uploads';
export { joinNickState, joinNotifyState, joinReadState, STATE_SPECS } from './outbox/joinStates';
