import type { DataContext, DataRepositoriesV2, RemoteGatewayBundle } from '@chatic/data';

export const DEFAULT_CONTEXT: DataContext = {
    cid: 'default',
};

/**
 * The gateway subset the app may call directly. Everything else goes through repositories so the
 * cache stays the single source of truth; these two are the ADR-0033 carve-out — relay invites are
 * polled, never persisted, so they have no repository to go through.
 */
export type DirectGateways = Pick<RemoteGatewayBundle, 'invite' | 'auth'>;

export interface IDataManager {
    ensure(context: DataContext): DataRepositoriesV2;
    getRepositories(): DataRepositoriesV2;
    getGateways(): DirectGateways;
    getContext(): DataContext;
    destroy(): void;
}
