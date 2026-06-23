import {
    createAuthGateway,
    createChannelGateway,
    createChatGateway,
    createCloudGateway,
    createDeviceGateway,
    createDomainGateway,
    createJoinGateway,
    createPlaceGateway,
    createProfileGateway,
    createUserGateway,
} from '@lemoncloud/chatic-sockets-lib';

import { createRemoteDataSources as createDataRemoteDataSources, type RemoteGatewayBundle } from '@chatic/data';

import { getSocketRuntime } from '../../socket/runtime';

export const createRemoteDataSources = () => {
    const socketClient = getSocketRuntime().proxy;
    const authGateway = createAuthGateway(socketClient as any);
    const channelGateway = createChannelGateway(socketClient as any);
    const chatGateway = createChatGateway(socketClient as any);
    const cloudGateway = createCloudGateway(socketClient as any);
    const deviceGateway = createDeviceGateway(socketClient as any);
    const userGateway = createUserGateway(socketClient as any);
    const placeGateway = createPlaceGateway(socketClient as any);
    const profileGateway = createProfileGateway(socketClient as any);
    const joinGateway = createJoinGateway(socketClient as any);
    const socketsGateway = createDomainGateway('sockets', socketClient as any);

    const gateways: RemoteGatewayBundle = {
        auth: authGateway,
        channel: channelGateway,
        chat: chatGateway,
        join: {
            // 1급 join 도메인: 단건 조회/수정은 JoinGateway(join.get/join.update)
            get: joinGateway.get,
            update: joinGateway.update,
            // 보조 command: 읽음(chat.read)·참여(channel.join). channel.update-join은 deprecated → join.update.
            read: chatGateway.read,
            join: channelGateway.join,
        },
        place: {
            // Place owns CRUD; the list still comes from UserGateway.mySite (same entity as site).
            create: placeGateway.create,
            get: placeGateway.get,
            update: placeGateway.update,
            delete: placeGateway.delete,
            mySite: userGateway.mySite,
        },
        user: {
            update: userGateway.update,
            listUser: channelGateway.listUser,
            invite: userGateway.invite,
            inviteBatch: userGateway.inviteBatch,
            syncUsers: channelGateway.syncUsers,
        },
        device: deviceGateway,
        sockets: socketsGateway,
        cloud: {
            get: cloudGateway.get,
            update: cloudGateway.update,
            delete: cloudGateway.delete,
        },
        profile: profileGateway,
    };

    return {
        remoteDataSources: createDataRemoteDataSources({ gateways }),
    };
};
