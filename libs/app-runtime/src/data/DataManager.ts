import type { DataContext, DataContextProvider, DataRepositories, IEventBus } from '@chatic/data';
import { DataContextHolder, type DomainEventMap, EventBusEngine } from '@chatic/data';

import { createLocalDataSources } from './factories/localFactory';
import { createRemoteDataSources } from './factories/remoteFactory';
import { createRepositories } from './factories/repositoryFactory';
import type { IDataManager } from './types';
import { DEFAULT_CONTEXT } from './types';
import type { ISocketManager } from '../socket/types';

export class DataManager implements IDataManager {
    private readonly contextHolder: DataContextProvider;
    private readonly domainEventBus: IEventBus<DomainEventMap>;
    private readonly repositories: DataRepositories;
    private readonly dispatcher: { destroy(): void };

    constructor(socketManager: ISocketManager, initialContext: DataContext = DEFAULT_CONTEXT) {
        this.contextHolder = new DataContextHolder(initialContext);
        this.domainEventBus = new EventBusEngine<DomainEventMap>();

        const { remoteDataSources, dispatcher } = createRemoteDataSources({
            domainEventBus: this.domainEventBus,
            socketManager,
        });
        this.dispatcher = dispatcher;
        const localDataSources = createLocalDataSources({
            contextProvider: this.contextHolder,
        });

        this.repositories = createRepositories({
            remoteDataSources,
            localDataSources,
            contextProvider: this.contextHolder,
            domainEventBus: this.domainEventBus,
        });
    }

    public ensure(context: DataContext): DataRepositories {
        this.contextHolder.setContext(context);
        return this.repositories;
    }

    public getRepositories(): DataRepositories {
        return this.repositories;
    }

    public getContext(): DataContext {
        return this.contextHolder.getContext();
    }

    public destroy(): void {
        this.dispatcher.destroy();
        this.contextHolder.setContext(DEFAULT_CONTEXT);
    }
}
