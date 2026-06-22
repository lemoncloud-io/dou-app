import type {
    AuthGateway,
    ChannelGateway,
    ChatGateway,
    CloudGateway,
    DeviceGateway,
    DomainGateway,
    PlaceGateway,
    ProfileGateway,
    UserGateway,
} from '@lemoncloud/chatic-sockets-lib';

export type JoinGateway = Pick<ChatGateway, 'read'> & Pick<ChannelGateway, 'updateJoin' | 'join'>;
// Place owns CRUD via PlaceGateway; the "my places" list still comes from UserGateway.mySite
// (PlaceGateway has no list method). Site was consolidated into this Place domain.
export type PlaceDomainGateway = PlaceGateway & Pick<UserGateway, 'mySite'>;
export type UserDomainGateway = Pick<ChannelGateway, 'listUser' | 'syncUsers'> &
    Pick<UserGateway, 'update' | 'invite' | 'inviteBatch'>;
export type SocketsGateway = Pick<DomainGateway, 'request'>;

export interface RemoteGatewayBundle {
    auth: AuthGateway;
    channel: ChannelGateway;
    chat: ChatGateway;
    join: JoinGateway;
    place: PlaceDomainGateway;
    user: UserDomainGateway;
    device: DeviceGateway;
    sockets: SocketsGateway;
    cloud: CloudGateway;
    profile: ProfileGateway;
}
