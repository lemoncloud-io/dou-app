import type {
    AuthGateway,
    ChannelGateway,
    ChatGateway,
    CloudGateway,
    DeviceGateway,
    DomainGateway,
    UserGateway,
} from '@lemoncloud/chatic-sockets-lib';

export type JoinGateway = Pick<ChatGateway, 'read'> & Pick<ChannelGateway, 'updateJoin' | 'join'>;
export type SiteGateway = Pick<UserGateway, 'mySite' | 'makeSite' | 'updateSite'>;
export type UserDomainGateway = Pick<ChannelGateway, 'listUser' | 'syncUsers' | 'syncProfile'> &
    Pick<UserGateway, 'updateProfile' | 'invite' | 'inviteBatch'>;
export type ProfileGateway = Pick<UserGateway, 'getSiteProfile' | 'setSiteProfile'>;
export type SocketsGateway = Pick<DomainGateway, 'request'>;

export interface RemoteGatewayBundle {
    auth: AuthGateway;
    channel: ChannelGateway;
    chat: ChatGateway;
    join: JoinGateway;
    site: SiteGateway;
    user: UserDomainGateway;
    device: DeviceGateway;
    sockets: SocketsGateway;
    cloud: CloudGateway;
    profile: ProfileGateway;
}
