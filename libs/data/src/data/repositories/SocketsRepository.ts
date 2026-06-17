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
    private static readonly TAG = 'SocketsRepository';

    constructor(
        private readonly socketsRemoteDataSource: ISocketsRemoteDataSource,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    public async findConnection(
        payload: SocketsFindConnectionInput,
        options?: RepositoryRequestOptions
    ): Promise<ConnectionModel> {
        return this.socketsRemoteDataSource.findConnection(payload);
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('socket:create', detail => {
            console.log(`[${SocketsRepository.TAG}] socket:create`, detail.data);
        });

        this.onDomainEvent('socket:update', detail => {
            console.log(`[${SocketsRepository.TAG}] socket:update`, detail.data);
        });

        this.onDomainEvent('socket:delete', detail => {
            console.log(`[${SocketsRepository.TAG}] socket:delete`, detail.data);
        });

        this.onDomainEvent('connection:create', detail => {
            console.log(`[${SocketsRepository.TAG}] connection:create`, detail.data);
        });

        this.onDomainEvent('connection:update', detail => {
            console.log(`[${SocketsRepository.TAG}] connection:update`, detail.data);
        });

        this.onDomainEvent('connection:delete', detail => {
            console.log(`[${SocketsRepository.TAG}] connection:delete`, detail.data);
        });
    }
}
