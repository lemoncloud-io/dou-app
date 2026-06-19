import {
    createAuthGateway,
    createChannelGateway,
    createChatGateway,
    createCloudGateway,
    createDeviceGateway,
    createDomainGateway,
    createUserGateway,
} from '@lemoncloud/chatic-sockets-lib';

import type { DomainEventMap, IEventBus, RemoteGatewayBundle } from '@chatic/data';
import { createRemoteDataSources as createRemote, SocketDispatcher } from '@chatic/data';

import { getSocketRuntime } from '../../socket/runtime';

export const createRemoteDataSources = ({ domainEventBus }: { domainEventBus: IEventBus<DomainEventMap> }) => {
    const socketClient = getSocketRuntime().proxy;
    const authGateway = createAuthGateway(socketClient as any);
    const channelGateway = createChannelGateway(socketClient as any);
    const chatGateway = createChatGateway(socketClient as any);
    const cloudGateway = createCloudGateway(socketClient as any);
    const deviceGateway = createDeviceGateway(socketClient as any);
    const userGateway = createUserGateway(socketClient as any);
    const socketsGateway = createDomainGateway('sockets', socketClient as any);

    const gateways: RemoteGatewayBundle = {
        auth: authGateway,
        channel: channelGateway,
        chat: chatGateway,
        join: {
            read: chatGateway.read,
            updateJoin: channelGateway.updateJoin,
            join: channelGateway.join,
        },
        site: {
            mySite: userGateway.mySite,
            makeSite: userGateway.makeSite,
            updateSite: userGateway.updateSite,
        },
        user: {
            listUser: channelGateway.listUser,
            updateProfile: userGateway.updateProfile,
            invite: userGateway.invite,
            inviteBatch: userGateway.inviteBatch,
            syncUsers: channelGateway.syncUsers,
            syncProfile: channelGateway.syncProfile,
        },
        device: deviceGateway,
        sockets: socketsGateway,
        cloud: cloudGateway,
        profile: {
            getSiteProfile: userGateway.getSiteProfile,
            setSiteProfile: userGateway.setSiteProfile,
        },
    };

    const remoteDataSources = createRemote({ domainEventBus, gateways });

    const dataDispatcher = new SocketDispatcher(
        socketClient,
        remoteDataSources.channel,
        remoteDataSources.chat,
        remoteDataSources.join,
        remoteDataSources.user,
        remoteDataSources.auth,
        remoteDataSources.device,
        remoteDataSources.sockets
    );

    return {
        remoteDataSources,
        dispatcher: {
            destroy() {
                dataDispatcher.destroy();
                socketClient.destroy();
            },
        },
    };
};
