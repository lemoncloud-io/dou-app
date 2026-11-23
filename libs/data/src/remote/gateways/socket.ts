import type {
    AuthGateway,
    ChannelGateway,
    ChatGateway,
    CloudGateway,
    DeviceGateway,
    DomainGateway,
    DomainGatewayCallOptions,
    InviteGateway,
    JoinGateway,
    PlaceGateway,
    ProfileGateway,
    UploadGateway,
    UserGateway,
    WebhookGateway,
} from '@lemoncloud/chatic-sockets-lib';
import type { ChannelGetRequestData } from '@lemoncloud/chatic-sockets-api/dist/lib/channel/types';

export type AuthSocketDomainGateway = Pick<AuthGateway, 'linkAccount'>;
export type ChatSocketDomainGateway = Pick<ChatGateway, 'send' | 'feed' | 'get' | 'update' | 'delete' | 'reaction'>;
export type ChannelSocketDomainGateway = Pick<
    ChannelGateway,
    'mine' | 'sync' | 'update' | 'delete' | 'create' | 'invite' | 'leave' | 'getSelf' | 'startDm'
> & {
    get<T = unknown>(data: ChannelGetRequestData, options?: DomainGatewayCallOptions): Promise<T>;
};
export type JoinSocketDomainGateway = Pick<JoinGateway, 'update'> & Pick<ChatGateway, 'read'>;
export type PlaceSocketDomainGateway = Pick<PlaceGateway, 'create' | 'update' | 'delete' | 'leave' | 'get'> &
    Pick<UserGateway, 'mySite'>;
export type DeviceSocketDomainGateway = Pick<DeviceGateway, 'save' | 'read' | 'sync' | 'updateRemote'>;

export type SocketRoute = 'active' | 'relay';

export type RoutedGateway<G> = Record<SocketRoute, G>;
export type ConnectionSocketDomainGateway = Pick<DomainGateway, 'request'>;
export type CloudSocketDomainGateway = Pick<CloudGateway, 'update' | 'get'>;
export type ProfileSocketDomainGateway = Pick<ProfileGateway, 'get' | 'getMine' | 'set' | 'sync'>;
export type UserSocketDomainGateway = Pick<ChannelGateway, 'listUser' | 'syncUsers'> &
    Pick<UserGateway, 'update' | 'profile' | 'invite' | 'inviteBatch' | 'listDevice' | 'unlinkDevice'> & {
        listPlaceUser: PlaceGateway['listUser'];
    };
export type InviteSocketDomainGateway = Pick<InviteGateway, 'create' | 'get' | 'list' | 'accept' | 'cancel' | 'reject'>;
export type UploadSocketDomainGateway = Pick<UploadGateway, 'start' | 'complete'>;

export type WebhookSocketDomainGateway = WebhookGateway;

export interface SocketGatewayBundle {
    auth: AuthSocketDomainGateway;
    channel: ChannelSocketDomainGateway;
    chat: ChatSocketDomainGateway;
    join: JoinSocketDomainGateway;
    place: PlaceSocketDomainGateway;
    user: UserSocketDomainGateway;
    invite: InviteSocketDomainGateway;
    device: RoutedGateway<DeviceSocketDomainGateway>;
    connection: ConnectionSocketDomainGateway;
    cloud: CloudSocketDomainGateway;
    profile: ProfileSocketDomainGateway;
    upload: UploadSocketDomainGateway;
    webhook: WebhookSocketDomainGateway;
}
