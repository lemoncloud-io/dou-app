import type { ProfileView, SiteProfileSyncView } from '@lemoncloud/chatic-socials-api';
import type {
    ProfileGetInput,
    ProfileGetMineInput,
    ProfileSetInput,
    ProfileSyncInput,
} from '@lemoncloud/chatic-sockets-lib';
import type { ProfileDomainGateway } from '../gateways';

export interface IProfileRemoteDataSource {
    get(payload: ProfileGetInput): Promise<ProfileView>;
    getMine(payload: ProfileGetMineInput): Promise<ProfileView>;
    set(payload: ProfileSetInput): Promise<ProfileView>;
    sync(payload: ProfileSyncInput): Promise<SiteProfileSyncView>;
}

export class ProfileRemoteDataSource implements IProfileRemoteDataSource {
    constructor(private readonly gateway: ProfileDomainGateway) {}
    get(payload: ProfileGetInput): Promise<ProfileView> {
        return this.gateway.get<ProfileView>(payload);
    }
    getMine(payload: ProfileGetMineInput): Promise<ProfileView> {
        return this.gateway.getMine(payload);
    }
    set(payload: ProfileSetInput): Promise<ProfileView> {
        return this.gateway.set(payload);
    }
    sync(payload: ProfileSyncInput): Promise<SiteProfileSyncView> {
        return this.gateway.sync(payload);
    }
}
