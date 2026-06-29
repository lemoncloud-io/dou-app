import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainCloud, DomainListResult } from '../domain';
import { createDomainListResult } from '../domain';
import type { ICloudLocalDataSourceV2 } from '../local/data-sources-v2';
import type { CloudDeleteInput, CloudGetInput, ICloudRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface ICloudRepositoryV2 extends DisposableRepositoryV2 {
    observeList(callback: (result: DomainListResult<DomainCloud> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainCloud | null) => void): () => void;

    getCloud(payload: CloudGetInput): Promise<DomainCloud>;
    updateCloud(payload: CloudUpdateInput): Promise<DomainCloud>;
    deleteCloud(payload: CloudDeleteInput): Promise<DomainCloud>;

    cacheRead(id: string): Promise<DomainCloud | null>;
    cacheReadList(): Promise<DomainListResult<DomainCloud> | null>;
    cacheWrite(item: Partial<DomainCloud>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainCloud>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

const resolveCloudId = (payload: unknown): string | undefined => {
    const candidate = payload as { id?: string; cid?: string };
    return candidate?.id || candidate?.cid || undefined;
};

/**
 * Local-first cloud facade: reads stay on the local cache while remote get/update/delete
 * commands keep that cache in sync. Clouds are classified via `cloudType` ('invited' | 'owner').
 */
export class CloudRepositoryV2 extends BaseRepositoryV2 implements ICloudRepositoryV2 {
    constructor(
        private readonly cloudRemoteDataSource: ICloudRemoteDataSource,
        private readonly cloudLocalDataSource: ICloudLocalDataSourceV2,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public observeList(callback: (result: DomainListResult<DomainCloud> | null) => void): () => void {
        return this.cloudLocalDataSource.observeList(undefined, callback as any, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainCloud | null) => void): () => void {
        return this.cloudLocalDataSource.observeItem(id, callback as any, this.getRepositoryContext());
    }

    public async getCloud(payload: CloudGetInput): Promise<DomainCloud> {
        // Capture the request-time context so a late response never pollutes a switched scope.
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domain = await this.cloudRemoteDataSource.getCloud(payload, normalizedContext);
        if (domain.id) {
            await this.cloudLocalDataSource.cacheWrite(domain, requestContext);
        }
        return domain;
    }

    public async updateCloud(payload: CloudUpdateInput): Promise<DomainCloud> {
        const id = resolveCloudId(payload);
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = id ? await this.cloudLocalDataSource.cacheRead(id, requestContext) : null;
        if (id) {
            await this.cloudLocalDataSource.cacheWrite({ id, ...(payload as Partial<DomainCloud>) }, requestContext);
        }
        try {
            const domain = await this.cloudRemoteDataSource.updateCloud(payload, normalizedContext);
            if (domain.id) {
                await this.cloudLocalDataSource.cacheWrite(domain, requestContext);
            }
            return domain;
        } catch (error) {
            if (existing) {
                await this.cloudLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    public async deleteCloud(payload: CloudDeleteInput): Promise<DomainCloud> {
        const id = resolveCloudId(payload) || '';
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = id ? await this.cloudLocalDataSource.cacheRead(id, requestContext) : null;
        if (id) {
            await this.cloudLocalDataSource.cacheDelete(id, requestContext);
        }
        try {
            return await this.cloudRemoteDataSource.deleteCloud(payload, normalizedContext);
        } catch (error) {
            if (existing) {
                await this.cloudLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    public cacheRead(id: string): Promise<DomainCloud | null> {
        return this.cloudLocalDataSource.cacheRead(id, this.getRepositoryContext()) as Promise<DomainCloud | null>;
    }

    public async cacheReadList(): Promise<DomainListResult<DomainCloud> | null> {
        return (
            ((await this.cloudLocalDataSource.cacheReadList(
                undefined,
                this.getRepositoryContext()
            )) as DomainListResult<DomainCloud> | null) ?? createDomainListResult([], { total: 0, source: 'local' })
        );
    }

    public cacheWrite(item: Partial<DomainCloud>): Promise<void> {
        return this.cloudLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheWriteMany(items: Array<Partial<DomainCloud>>): Promise<void> {
        return this.cloudLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.cloudLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.cloudLocalDataSource.cacheClear(this.getRepositoryContext());
    }
}
