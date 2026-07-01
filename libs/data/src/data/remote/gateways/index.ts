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
export type DeviceDomainGateway = Pick<DeviceGateway, 'save' | 'read' | 'sync'>;
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
    device: DeviceDomainGateway;
    sockets: SocketDomainGateway;
    cloud: CloudDomainGateway;
    profile: ProfileDomainGateway;
}
