import type {
    OutboxTransport as GraphOutboxTransport,
    StateSpec as GraphStateSpec,
    StateSpecs as GraphStateSpecs,
} from '@chatic/data-local';
import type { DataRepositories } from '@chatic/data-repositories';

export * from '@chatic/data-model';
export * from '@chatic/data-api';
export * from '@chatic/data-local';
export * from '@chatic/data-repositories';

export type OutboxTransport = GraphOutboxTransport<DataRepositories>;
export type StateSpec<V> = GraphStateSpec<V, DataRepositories>;
export type StateSpecs = GraphStateSpecs<DataRepositories>;
