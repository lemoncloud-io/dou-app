import {
    createAuthGateway,
    createChannelGateway,
    createChatGateway,
    createCloudGateway,
    createDeviceGateway,
    createDomainGateway,
    createInviteGateway,
    createJoinGateway,
    createPlaceGateway,
    createProfileGateway,
    createUserGateway,
} from '@lemoncloud/chatic-sockets-lib';

import {
    createSocketDataSources as createDataSocketDataSources,
    type SocketGatewayBundle,
    type RoutedGateway,
} from '@chatic/data';

import { getSocketRuntime } from '../../socket/runtime';

export const createSocketDataSources = () => {
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

    // Relay-pinned gateways. The 1:1 invite domain and the phone/social identity packets are owned
    // by the central backend behind the RELAY server, so they must not follow the active slot into
    // a cloud. Same policy shape as device.update-remote: the destination is fixed at composition
    // time instead of exposed as a route, so no caller can leak it. See socket/kind-scoped-routing.md.
    const relayClient = socketClient.getScopedClient('relay');
    const relayAuthGateway = createAuthGateway(relayClient as any);
    const inviteGateway = createInviteGateway(relayClient as any);

    const channelGateway = createChannelGateway(socketClient as any);
    const chatGateway = createChatGateway(socketClient as any);
    const cloudGateway = createCloudGateway(socketClient as any);
    const deviceGateway = routed(createDeviceGateway);
    const userGateway = createUserGateway(socketClient as any);
    const placeGateway = createPlaceGateway(socketClient as any);
    const profileGateway = createProfileGateway(socketClient as any);
    const joinGateway = createJoinGateway(socketClient as any);
    // Wire module stays `sockets` (action `sockets/find-connection`); the app-side domain is
    // `connection` — same split as `join`/`place`, whose bundle keys are not wire module names.
    const connectionGateway = createDomainGateway('sockets', socketClient as any);

    const gateways: SocketGatewayBundle = {
        auth: {
            // The identity packet stays on relay. `auth.update` is deliberately absent: the socket
            // handshake belongs to the SDK's AuthController, so this bundle offers no way to send it
            // (see AuthSocketDomainGateway · socket/authUpdateAbsence.test.ts).
            linkAccount: relayAuthGateway.linkAccount,
        },
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
        invite: inviteGateway,
        device: deviceGateway,
        connection: connectionGateway,
        cloud: {
            get: cloudGateway.get,
            update: cloudGateway.update,
            delete: cloudGateway.delete,
        },
        profile: profileGateway,
    };

    // Gateways are not handed back: every caller goes through a repository (ADR-0036), so the bundle
    // exists only long enough to build the data sources.
    return { socketDataSources: createDataSocketDataSources({ gateways }) };
};
