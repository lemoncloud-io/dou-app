import type { ProfileView } from '@lemoncloud/chatic-socials-api';
import type {
    ProfileGateway,
    ProfileGetInput,
    ProfileGetMineInput,
    ProfileSetInput,
    ProfileSyncInput,
} from '@lemoncloud/chatic-sockets-lib';

export interface IProfileRemoteDataSource {
    get(payload: ProfileGetInput): Promise<ProfileView>;
    getMine(payload: ProfileGetMineInput): Promise<ProfileView>;
    set(payload: ProfileSetInput): Promise<ProfileView>;
    sync(payload: ProfileSyncInput): Promise<ProfileView>;
}

export class ProfileRemoteDataSource implements IProfileRemoteDataSource {
    constructor(private readonly gateway: ProfileGateway) {}
    get(payload: ProfileGetInput): Promise<ProfileView> {
        return this.gateway.get<ProfileView>(payload);
    }
    getMine(payload: ProfileGetMineInput): Promise<ProfileView> {
        return this.gateway.getMine(payload);
    }
    set(payload: ProfileSetInput): Promise<ProfileView> {
        return this.gateway.set(payload);
    }
    sync(payload: ProfileSyncInput): Promise<ProfileView> {
        return this.gateway.sync(payload);
    }
}
