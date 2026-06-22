import type { ProfileGateway } from '../gateways';
import type { UserGetSiteProfileInput, UserSetSiteProfileInput } from '@lemoncloud/chatic-sockets-api';
import type { ProfileView } from '@lemoncloud/chatic-socials-api';

export interface IProfileRemoteDataSource {
    /** 사이트 프로필 조회를 요청합니다. */
    getSiteProfile(payload: UserGetSiteProfileInput): Promise<ProfileView>;
    /** 사이트 프로필 설정을 요청합니다. */
    setSiteProfile(payload: UserSetSiteProfileInput): Promise<ProfileView>;
}

export class ProfileRemoteDataSource implements IProfileRemoteDataSource {
    constructor(private readonly gateway: ProfileGateway) {}

    public async getSiteProfile(payload: UserGetSiteProfileInput): Promise<ProfileView> {
        return this.gateway.getSiteProfile(payload);
    }

    public async setSiteProfile(payload: UserSetSiteProfileInput): Promise<ProfileView> {
        return this.gateway.setSiteProfile(payload);
    }
}
