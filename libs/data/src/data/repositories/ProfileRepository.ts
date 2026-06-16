import type { UserGetSiteProfileInput, UserSetSiteProfileInput } from '@lemoncloud/chatic-sockets-api';
import type { IProfileRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider, RepositoryRequestOptions } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';

export interface IProfileRepository {
    getSiteProfile(payload?: UserGetSiteProfileInput, options?: RepositoryRequestOptions): Promise<unknown>;
    setSiteProfile(payload: UserSetSiteProfileInput, options?: RepositoryRequestOptions): Promise<unknown>;
}

export class ProfileRepository extends BaseRepository implements IProfileRepository {
    constructor(
        private readonly profileRemoteDataSource: IProfileRemoteDataSource,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
    }

    public async getSiteProfile(
        payload?: UserGetSiteProfileInput,
        options?: RepositoryRequestOptions
    ): Promise<unknown> {
        return this.profileRemoteDataSource.getSiteProfile(payload ?? {});
    }

    public async setSiteProfile(
        payload: UserSetSiteProfileInput,
        options?: RepositoryRequestOptions
    ): Promise<unknown> {
        return this.profileRemoteDataSource.setSiteProfile(payload);
    }
}
