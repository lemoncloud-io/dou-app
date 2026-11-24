import {
    createAuthGateway,
    createChannelGateway,
    createChatGateway,
    createCloudGateway,
    createDeviceGateway,
    createDomainGateway,
    createInviteGateway,
    createJoinGateway,
    createMiniAppGateway,
    createPlaceGateway,
    createProfileGateway,
    createUploadGateway,
    createUserGateway,
    createWebhookGateway,
} from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import {
    createSocketDataSources as createDataSocketDataSources,
    type SocketGatewayBundle,
    type RoutedGateway,
} from '@chatic/data';

import { getSocketManager, getSocketErrorCode, RELAY_SLOT } from '@chatic/transport';
import type { ScopedSocketClient } from '@chatic/transport';
import { clearRefusedChannel, recordRefusedChannel } from '@chatic/sync';

const observeMembershipRefusal = <TFn extends (payload: any, ...rest: any[]) => Promise<any>>(syncUsers: TFn): TFn =>
    (async (payload: any, ...rest: any[]) => {
        const channelId: unknown = payload?.channelId;
        try {
            const result = await syncUsers(payload, ...rest);
            if (typeof channelId === 'string') clearRefusedChannel(channelId);
            return result;
        } catch (error) {
            if (typeof channelId === 'string' && getSocketErrorCode(error) === 403) {
                recordRefusedChannel(channelId);
            }
            throw error;
        }
    }) as TFn;

export const createSocketDataSources = (socketClient: ScopedSocketClient = getSocketManager()) => {
    const relayClient = getSocketManager().getScopedClient(RELAY_SLOT);

    const routed = <G>(create: (client: any) => G): RoutedGateway<G> => ({
        active: create(socketClient),
        relay: create(relayClient),
    });

    const relayAuthGateway = createAuthGateway(relayClient as any);
    const inviteGateway = createInviteGateway(relayClient as any);
    const cloudGateway = createCloudGateway(relayClient as any);

    const channelGateway = createChannelGateway(socketClient as any);
    const channelDomainGateway = createDomainGateway('channel', socketClient as any);
    const chatGateway = createChatGateway(socketClient as any);
    const deviceGateway = routed(createDeviceGateway);
    const userGateway = createUserGateway(socketClient as any);
    const placeGateway = createPlaceGateway(socketClient as any);
    const profileGateway = createProfileGateway(socketClient as any);
    const joinGateway = createJoinGateway(socketClient as any);
    const uploadGateway = createUploadGateway(socketClient as any);
    const webhookGateway = createWebhookGateway(socketClient as any);
    const miniAppsGateway = createMiniAppGateway(socketClient as unknown as ClientSocketV2);
    const connectionGateway = createDomainGateway('sockets', socketClient as any);

    const gateways: SocketGatewayBundle = {
        auth: {
            linkAccount: relayAuthGateway.linkAccount,
        },
        channel: {
            ...channelGateway,
            get: <T = unknown>(data: unknown, options?: { as?: string }): Promise<T> =>
                channelDomainGateway.request<T>('get', data, options),
        },
        chat: chatGateway,
        join: {
            update: joinGateway.update,
            read: chatGateway.read,
        },
        place: {
            create: placeGateway.create,
            update: placeGateway.update,
            delete: placeGateway.delete,
            leave: placeGateway.leave,
            get: placeGateway.get,
            mySite: userGateway.mySite,
        },
        user: {
            update: userGateway.update,
            profile: userGateway.profile,
            listUser: channelGateway.listUser,
            listPlaceUser: placeGateway.listUser,
            invite: userGateway.invite,
            inviteBatch: userGateway.inviteBatch,
            listDevice: userGateway.listDevice,
            unlinkDevice: userGateway.unlinkDevice,
            syncUsers: observeMembershipRefusal(channelGateway.syncUsers),
        },
        invite: inviteGateway,
        device: deviceGateway,
        connection: connectionGateway,
        cloud: {
            get: cloudGateway.get,
            update: cloudGateway.update,
        },
        profile: profileGateway,
        upload: uploadGateway,
        webhook: webhookGateway,
        miniApp: miniAppsGateway,
    };

    return { socketDataSources: createDataSocketDataSources({ gateways }) };
};
