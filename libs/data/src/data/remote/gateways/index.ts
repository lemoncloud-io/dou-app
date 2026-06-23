import type {
    AuthGateway,
    ChannelGateway,
    ChatGateway,
    CloudGateway,
    DomainGateway,
    PlaceGateway,
    ProfileGateway,
    UserGateway,
} from '@lemoncloud/chatic-sockets-lib';

export type AuthDomainGateway = Pick<AuthGateway, 'update'>;
export type ChatDomainGateway = Pick<ChatGateway, 'read'>;
export type ChannelDomainGateway = Pick<
    ChannelGateway,
    'create' | 'update' | 'delete' | 'leave' | 'getSelf' | 'mine' | 'unreads' | 'sync'
>;
export type JoinDomainGateway = Pick<ChatGateway, 'read'> & Pick<ChannelGateway, 'updateJoin' | 'join'>;
export type PlaceDomainGateway = PlaceGateway & Pick<UserGateway, 'mySite'>;
export type UserDomainGateway = Pick<ChannelGateway, 'listUser' | 'syncUsers'> &
    Pick<UserGateway, 'update' | 'invite' | 'inviteBatch'>;
export type DeviceDomainGateway = DomainGateway;
export type SocketDomainGateway = Pick<DomainGateway, 'request'>;
export type CloudDomainGateway = Pick<CloudGateway, 'update' | 'get' | 'delete'>;
export type ProfileDomainGateway = ProfileGateway;

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
