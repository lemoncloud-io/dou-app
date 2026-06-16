import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';
import type { ConnectionModel } from '@lemoncloud/chatic-sockets-api/dist/modules/sockets/model';
import type { ISocketsRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider, RepositoryRequestOptions } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';

export interface ISocketsRepository {
    findConnection(payload: SocketsFindConnectionInput, options?: RepositoryRequestOptions): Promise<ConnectionModel>;
}

export class SocketsRepository extends BaseRepository implements ISocketsRepository {
    constructor(
        private readonly socketsRemoteDataSource: ISocketsRemoteDataSource,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
    }

    public async findConnection(
        payload: SocketsFindConnectionInput,
        options?: RepositoryRequestOptions
    ): Promise<ConnectionModel> {
        return this.socketsRemoteDataSource.findConnection(payload);
    }
}
