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
    UploadGateway,
    UserGateway,
} from '@lemoncloud/chatic-sockets-lib';

/**
 * `update` authenticates whichever slot is active. `linkAccount` is the unified account-proof packet
 * (phone/email/social × link/login × send/resend/verify/confirm) and is a relay DM-invite identity
 * packet: the main user it resolves to lives in the central backend behind the relay, so the
 * composition root binds it to the relay slot. See ADR-0089, ADR-0042.
 *
 * The two packets it replaced (`verifyHashAlias`, `attachSocial`) are deliberately NOT listed. They
 * still exist on the wire and on `AuthGateway` as `@deprecated`, but leaving them out of this Pick is
 * what keeps a caller from reaching them — the backend deletes them once the app has no call sites.
 *
 * `update` is left out for the same reason, and it is the load-bearing one: `auth.update` is the
 * socket handshake, owned end to end by the SDK's AuthController. A second sender would authenticate
 * a connection the controller does not know it authenticated, so the controller's own state machine
 * (refresh scheduling, failure counting, terminal `expired`) would be reasoning about a session it
 * did not open. Nothing outside the SDK may send it — see app-runtime's `authUpdateAbsence.test.ts`.
 */
export type AuthSocketDomainGateway = Pick<AuthGateway, 'linkAccount'>;
export type ChatSocketDomainGateway = Pick<ChatGateway, 'send' | 'feed' | 'get' | 'update' | 'delete' | 'reaction'>;
export type ChannelSocketDomainGateway = Pick<
    ChannelGateway,
    'mine' | 'sync' | 'update' | 'delete' | 'create' | 'invite' | 'leave' | 'getSelf' | 'startDm'
>;
export type JoinSocketDomainGateway = Pick<JoinGateway, 'update'> & Pick<ChatGateway, 'read'>;
export type PlaceSocketDomainGateway = Pick<PlaceGateway, 'create' | 'update' | 'delete'> & Pick<UserGateway, 'mySite'>;
export type DeviceSocketDomainGateway = Pick<DeviceGateway, 'save' | 'read' | 'sync' | 'updateRemote'>;

/**
 * Where a routed request is sent, chosen by the CALLER (not baked into the domain):
 * - `active`: the currently active slot (cloud when a cloud is active, else relay) — the default.
 * - `relay`: the relay's slot regardless of which is active.
 *
 * There is no `cloud` route. "The cloud slot" named a role — whichever cloud happened to be committed —
 * not an address, and no caller ever used it.
 */
export type SocketRoute = 'active' | 'relay';

/** The same gateway bound once per route, so a data source can pick a destination at call time. */
export type RoutedGateway<G> = Record<SocketRoute, G>;
export type ConnectionSocketDomainGateway = Pick<DomainGateway, 'request'>;
export type CloudSocketDomainGateway = Pick<CloudGateway, 'update' | 'get'>;
export type ProfileSocketDomainGateway = Pick<ProfileGateway, 'get' | 'getMine' | 'set' | 'sync'>;
export type UserSocketDomainGateway = Pick<ChannelGateway, 'listUser' | 'syncUsers'> &
    Pick<UserGateway, 'update' | 'profile' | 'invite' | 'inviteBatch'>;
/**
 * Relay 1:1 (DM) invite codes — distinct from `UserSocketDomainGateway.invite`, which is the cloud
 * bulk-invite action (ADR-0016). Issued and redeemed on the relay server, so the composition root
 * pins this bundle entry to the relay slot rather than the active one. See ADR-0089.
 */
export type InviteSocketDomainGateway = Pick<InviteGateway, 'create' | 'get' | 'list' | 'accept' | 'cancel' | 'reject'>;
/**
 * Image attachments: `start` issues a presigned PUT per slot, `complete` settles them. `read` is left
 * out — it is owner-only and the send sequence learns every status it needs from `complete`.
 */
export type UploadSocketDomainGateway = Pick<UploadGateway, 'start' | 'complete'>;

export interface SocketGatewayBundle {
    auth: AuthSocketDomainGateway;
    channel: ChannelSocketDomainGateway;
    chat: ChatSocketDomainGateway;
    join: JoinSocketDomainGateway;
    place: PlaceSocketDomainGateway;
    user: UserSocketDomainGateway;
    invite: InviteSocketDomainGateway;
    // Device is ROUTED: save/read/sync go to `active`, while `update-remote` (relay-owned push
    // settings) is sent to whichever route the caller picks. See RoutedGateway / SocketRoute.
    device: RoutedGateway<DeviceSocketDomainGateway>;
    connection: ConnectionSocketDomainGateway;
    cloud: CloudSocketDomainGateway;
    profile: ProfileSocketDomainGateway;
    upload: UploadSocketDomainGateway;
}
