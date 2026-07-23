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

import {
    createRemoteDataSources as createDataRemoteDataSources,
    type RemoteGatewayBundle,
    type RoutedGateway,
} from '@chatic/data';

import { getSocketRuntime } from '../../socket/runtime';

export const createRemoteDataSources = () => {
    // Gateways bind to the SocketManager stable facade (request/send/onType); socket
    // replacement stays invisible to them. (Formerly the ManagedSocketClientProxy.)
    const socketClient = getSocketRuntime().socketManager;

    // Build a gateway once per route so a data source can pick a destination at call time. `active`
    // is the manager facade (active slot); `relay`/`cloud` are kind-pinned scoped clients that
    // resolve their slot lazily — so a relay-only write lands on relay even while a cloud is active.
    // See app-runtime socket/kind-scoped-routing.md.
    const routed = <G>(create: (client: any) => G): RoutedGateway<G> => ({
        active: create(socketClient),
        relay: create(socketClient.getScopedClient('relay')),
        cloud: create(socketClient.getScopedClient('cloud')),
    });

    const authGateway = createAuthGateway(socketClient as any);
    const channelGateway = createChannelGateway(socketClient as any);
    const chatGateway = createChatGateway(socketClient as any);
    const cloudGateway = createCloudGateway(socketClient as any);
    const deviceGateway = routed(createDeviceGateway);
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
            profile: userGateway.profile,
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
