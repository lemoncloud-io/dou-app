import type {
    AuthGateway,
    ChannelGateway,
    ChatGateway,
    CloudGateway,
    DeviceGateway,
    DomainGateway,
    InviteGateway,
    JoinGateway,
    PlaceGateway,
    ProfileGateway,
    UserGateway,
} from '@lemoncloud/chatic-sockets-lib';

/**
 * `update` authenticates whichever slot is active. `linkAccount` is the unified account-proof packet
 * (phone/email/social × link/login × send/resend/verify/confirm) and is a relay DM-invite identity
 * packet: the main user it resolves to lives in the central backend behind the relay, so the
 * composition root binds it to the relay slot. See ADR-0033, ADR-0042.
 *
 * The two packets it replaced (`verifyHashAlias`, `attachSocial`) are deliberately NOT listed. They
 * still exist on the wire and on `AuthGateway` as `@deprecated`, but leaving them out of this Pick is
 * what keeps a caller from reaching them — the backend deletes them once the app has no call sites.
 */
export type AuthDomainGateway = Pick<AuthGateway, 'update' | 'linkAccount'>;
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
/**
 * Relay 1:1 (DM) invite codes — distinct from `UserDomainGateway.invite`, which is the cloud
 * bulk-invite action (ADR-0016). Issued and redeemed on the relay server, so the composition root
 * pins this bundle entry to the relay slot rather than the active one. See ADR-0033.
 */
export type InviteDomainGateway = Pick<InviteGateway, 'create' | 'get' | 'list' | 'accept' | 'cancel' | 'reject'>;

export interface RemoteGatewayBundle {
    auth: AuthDomainGateway;
    channel: ChannelDomainGateway;
    chat: ChatDomainGateway;
    join: JoinDomainGateway;
    place: PlaceDomainGateway;
    user: UserDomainGateway;
    invite: InviteDomainGateway;
    // Device is ROUTED: save/read/sync go to `active`, while `update-remote` (relay-owned push
    // settings) is sent to whichever route the caller picks. See RoutedGateway / SocketRoute.
    device: RoutedGateway<DeviceDomainGateway>;
    sockets: SocketDomainGateway;
    cloud: CloudDomainGateway;
    profile: ProfileDomainGateway;
}
