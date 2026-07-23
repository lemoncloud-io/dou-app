import type {
    AuthGateway,
    ChannelGateway,
    ChatGateway,
    CloudGateway,
    DeviceGateway,
    DomainGateway,
    JoinGateway,
    PlaceGateway,
    ProfileGateway,
    UserGateway,
} from '@lemoncloud/chatic-sockets-lib';

export type AuthDomainGateway = Pick<AuthGateway, 'update'>;
export type ChatDomainGateway = Pick<ChatGateway, 'send' | 'feed' | 'get' | 'update' | 'delete'>;
export type ChannelDomainGateway = Pick<
    ChannelGateway,
    'mine' | 'sync' | 'update' | 'delete' | 'create' | 'invite' | 'leave' | 'getSelf' | 'unreads'
>;
export type JoinDomainGateway = JoinGateway & Pick<ChatGateway, 'read'> & Pick<ChannelGateway, 'join'>;
export type PlaceDomainGateway = Pick<PlaceGateway, 'create' | 'get' | 'update' | 'delete'> &
    Pick<UserGateway, 'mySite'>;
export type DeviceDomainGateway = Pick<DeviceGateway, 'save' | 'read' | 'sync' | 'updateRemote'>;

/**
 * Where a routed request is sent, chosen by the CALLER (not baked into the domain):
 * - `active`: the currently active slot (cloud when a cloud is active, else relay) — the default.
 * - `relay` / `cloud`: that specific slot regardless of which is active.
 * See app-runtime socket/kind-scoped-routing.md.
 */
export type SocketRoute = 'active' | 'relay' | 'cloud';

/** The same gateway bound once per route, so a data source can pick a destination at call time. */
export type RoutedGateway<G> = Record<SocketRoute, G>;
export type SocketDomainGateway = Pick<DomainGateway, 'request'>;
export type CloudDomainGateway = Pick<CloudGateway, 'update' | 'get' | 'delete'>;
export type ProfileDomainGateway = Pick<ProfileGateway, 'get' | 'getMine' | 'set' | 'sync'>;
export type UserDomainGateway = Pick<ChannelGateway, 'listUser' | 'syncUsers'> &
    Pick<UserGateway, 'update' | 'profile' | 'invite' | 'inviteBatch'>;

export interface RemoteGatewayBundle {
    auth: AuthDomainGateway;
    channel: ChannelDomainGateway;
    chat: ChatDomainGateway;
    join: JoinDomainGateway;
    place: PlaceDomainGateway;
    user: UserDomainGateway;
    // Device is ROUTED: save/read/sync go to `active`, while `update-remote` (relay-owned push
    // settings) is sent to whichever route the caller picks. See RoutedGateway / SocketRoute.
    device: RoutedGateway<DeviceDomainGateway>;
    sockets: SocketDomainGateway;
    cloud: CloudDomainGateway;
    profile: ProfileDomainGateway;
}
