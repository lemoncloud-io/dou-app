import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { CloudDeleteInput, CloudGetInput, ICloudRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider, RepositoryRequestOptions } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';

export interface ICloudRepository {
    getCloud(payload: CloudGetInput, options?: RepositoryRequestOptions): Promise<unknown>;
    updateCloud(payload: CloudUpdateInput, options?: RepositoryRequestOptions): Promise<unknown>;
    deleteCloud(payload: CloudDeleteInput, options?: RepositoryRequestOptions): Promise<unknown>;
}

export class CloudRepository extends BaseRepository implements ICloudRepository {
    constructor(
        private readonly cloudRemoteDataSource: ICloudRemoteDataSource,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
    }

    public async getCloud(payload: CloudGetInput, options?: RepositoryRequestOptions): Promise<unknown> {
        return this.cloudRemoteDataSource.getCloud(payload);
    }

    public async updateCloud(payload: CloudUpdateInput, options?: RepositoryRequestOptions): Promise<unknown> {
        return this.cloudRemoteDataSource.updateCloud(payload);
    }

    public async deleteCloud(payload: CloudDeleteInput, options?: RepositoryRequestOptions): Promise<unknown> {
        return this.cloudRemoteDataSource.deleteCloud(payload);
    }
}
