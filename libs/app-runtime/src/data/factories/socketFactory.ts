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
    createUploadGateway,
    createUserGateway,
} from '@lemoncloud/chatic-sockets-lib';

import {
    createSocketDataSources as createDataSocketDataSources,
    type SocketGatewayBundle,
    type RoutedGateway,
} from '@chatic/data';

import { getSocketManager } from '../../socket/runtime';
import { clearRefusedChannel, recordRefusedChannel } from '../../socket/sync/refusedChannels';
import { getSocketErrorCode } from '../../socket/utils/socketErrorCode';
import type { ScopedSocketClient } from '../../socket/types';
import { RELAY_SLOT } from '../../socket/utils/slotKey';

/**
 * Wraps `channel.sync-users` so its verdict on my membership is not thrown away.
 *
 * **This call is the only one that answers the question.** Measured on dev (2026-09-21) from the
 * account that had just left a 1:1: `channel.get` still succeeds and the message read still
 * succeeds, so the sync scheduler never classifies that target `gone` and the room has nothing to
 * go on but a timeout. `channel.sync-users` answers
 * `403 FORBIDDEN - not a member of channel @verifyJoin(...)` — the server stating the membership
 * fact in as many words.
 *
 * Only 403 counts. A 404, a timeout, a dropped socket say nothing about membership, and telling
 * somebody with no connection that they are not in a conversation is the lie this whole path exists
 * to avoid. A success clears the entry, because a re-invite makes the same room readable again.
 *
 * Wrapped at the gateway rather than at the call site: `useChannelMembers` swallows this rejection
 * on purpose (a failed member hydration must not break a room that renders fine without it), and a
 * second caller would have to remember to do this again.
 */
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

/**
 * @param socketClient What the cloud-domain gateways send through. The default is the manager's
 *   active facade (whichever slot is active), which is what the app's own repository graph uses. A
 *   scoped graph passes one slot's `getScopedClient(key)` instead, so everything it sends reaches the
 *   cloud it was built for however the active slot moves. The relay-pinned gateways ignore it either
 *   way — they belong to the relay whoever asks.
 */
export const createSocketDataSources = (socketClient: ScopedSocketClient = getSocketManager()) => {
    // Gateways bind to a stable facade (request/send/onType); socket replacement stays invisible to
    // them. (Formerly the ManagedSocketClientProxy.)
    const relayClient = getSocketManager().getScopedClient(RELAY_SLOT);

    // Build a gateway once per route so a data source can pick a destination at call time. `active`
    // is the client above; `relay` is a slot-pinned scoped client that resolves its slot lazily — so
    // a relay-only write lands on relay even while a cloud is active.
    const routed = <G>(create: (client: any) => G): RoutedGateway<G> => ({
        active: create(socketClient),
        relay: create(relayClient),
    });

    // Relay-pinned gateways. The 1:1 invite domain and the phone/social identity packets are owned
    // by the central backend behind the RELAY server, so they must not follow the active slot into
    // a cloud. Same policy shape as device.update-remote: the destination is fixed at composition
    // time instead of exposed as a route, so no caller can leak it.
    const relayAuthGateway = createAuthGateway(relayClient as any);
    const inviteGateway = createInviteGateway(relayClient as any);

    const channelGateway = createChannelGateway(socketClient as any);
    // `channel.get` has no typed SDK wrapper (its sync plans call the raw packet), so it is bound
    // here through the channel domain gateway — the single-channel snapshot `refreshOne` pulls.
    const channelDomainGateway = createDomainGateway('channel', socketClient as any);
    const chatGateway = createChatGateway(socketClient as any);
    const cloudGateway = createCloudGateway(socketClient as any);
    const deviceGateway = routed(createDeviceGateway);
    const userGateway = createUserGateway(socketClient as any);
    const placeGateway = createPlaceGateway(socketClient as any);
    const profileGateway = createProfileGateway(socketClient as any);
    const joinGateway = createJoinGateway(socketClient as any);
    const uploadGateway = createUploadGateway(socketClient as any);
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
        channel: {
            ...channelGateway,
            get: <T = unknown>(data: unknown, options?: { as?: string }): Promise<T> =>
                channelDomainGateway.request<T>('get', data, options),
        },
        chat: chatGateway,
        join: {
            // First-class join domain: the update goes through JoinGateway (join.update);
            // channel.update-join is deprecated → join.update. Marking read is chat.read.
            update: joinGateway.update,
            read: chatGateway.read,
        },
        place: {
            // Create/update/delete through PlaceGateway; the list still comes from UserGateway.mySite
            // (same entity as site).
            create: placeGateway.create,
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
    };

    // Gateways are not handed back: every caller goes through a repository (ADR-0036), so the bundle
    // exists only long enough to build the data sources.
    return { socketDataSources: createDataSocketDataSources({ gateways }) };
};
