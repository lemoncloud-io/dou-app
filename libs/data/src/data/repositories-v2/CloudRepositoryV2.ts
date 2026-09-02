import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { CloudBody, CloudVerifyEmailBody, CloudVerifyEmailView } from '@lemoncloud/chatic-backend-api';
import type { DomainCloud, DomainListResult } from '../domain';
import { createDomainListResult } from '../domain';
import type { ICloudLocalDataSourceV2 } from '../local/data-sources-v2';
import type { CloudDeleteInput, CloudGetInput, ICloudSocketDataSource } from '../remote/socket-data-sources';
import type { CloudMakeOptions, CloudReleaseOptions, ICloudHttpDataSource } from '../remote/http-data-sources';
import type { DataContext, DataContextProvider } from './types';
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

    /**
     * HTTP catalog/command surface (ADR-0070 결정 5, 2단계 후반). `ICloudHttpDataSource` injection
     * is optional through 2단계 — existing `createRepositoriesV2` call sites stay green without
     * it. **Never writes local cache** — the catalog mixes invited/owned clouds and would poison
     * `cloudType` classification (see CloudHttpDataSource). React-query owns this read's cache.
     */
    fetchCloudCatalog(params?: Record<string, unknown>): Promise<DomainListResult<DomainCloud>>;
    verifyCloudEmail(body: CloudVerifyEmailBody, opts?: { dryRun?: boolean }): Promise<CloudVerifyEmailView>;
    /**
     * `dryRun` mirrors the membership route's DEV behaviour (ADR-0060 §7) so a dev/local session
     * never provisions real infrastructure; `cascade` drops the cloud's dependent records too.
     * Both were `params` the REST hooks passed straight to the gateway — they are named options
     * here so the app never spells wire params itself.
     */
    makeCloud(body: CloudBody, opts?: CloudMakeOptions): Promise<DomainCloud>;
    releaseCloud(cloudId: string, opts?: CloudReleaseOptions): Promise<DomainCloud>;
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
        private readonly cloudSocketDataSource: ICloudSocketDataSource,
        private readonly cloudLocalDataSource: ICloudLocalDataSourceV2,
        contextProvider: DataContextProvider,
        private readonly cloudHttpDataSource?: ICloudHttpDataSource
    ) {
        super(contextProvider);
    }

    private requireHttp(): ICloudHttpDataSource {
        if (!this.cloudHttpDataSource) {
            throw new Error('[CloudRepositoryV2] ICloudHttpDataSource is not injected — httpFactory not wired yet.');
        }
        return this.cloudHttpDataSource;
    }

    public async fetchCloudCatalog(params?: Record<string, unknown>): Promise<DomainListResult<DomainCloud>> {
        return this.requireHttp().listClouds(params, this.getRequestContext());
    }

    public async verifyCloudEmail(
        body: CloudVerifyEmailBody,
        opts?: { dryRun?: boolean }
    ): Promise<CloudVerifyEmailView> {
        return this.requireHttp().verifyEmail(body, opts);
    }

    public async makeCloud(body: CloudBody, opts?: CloudMakeOptions): Promise<DomainCloud> {
        return this.requireHttp().makeCloud(body, this.getRequestContext(), opts);
    }

    public async releaseCloud(cloudId: string, opts?: CloudReleaseOptions): Promise<DomainCloud> {
        return this.requireHttp().releaseCloud(cloudId, this.getRequestContext(), opts);
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
        const cloud = await this.cloudSocketDataSource.getCloud(payload, normalizedContext);
        // Mirror the freshly loaded subscription cloud into the cache, overwriting its stale
        // name/fields so observers (name display, etc.) reflect the latest server value.
        await this.persistCloud(cloud, resolveCloudId(payload), requestContext);
        return cloud;
    }

    public async updateCloud(payload: CloudUpdateInput): Promise<DomainCloud> {
        const id = resolveCloudId(payload) || '';
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = id ? await this.cloudLocalDataSource.cacheRead(id, requestContext) : null;

        // Optimistically apply the edit so observers update immediately, keeping the cloud's type
        // (invited vs owned) intact via the same resolution used on the authoritative write.
        if (id) {
            await this.cloudLocalDataSource.cacheWrite(
                {
                    ...(existing ?? {}),
                    ...(payload as Partial<DomainCloud>),
                    id,
                    cid: existing?.cid || id,
                    cloudType: this.resolveCloudType(payload as Partial<DomainCloud>, existing),
                },
                requestContext
            );
        }

        try {
            const updated = await this.cloudSocketDataSource.updateCloud(payload, normalizedContext);
            // Reconcile the cache with the authoritative response (name, etc.).
            await this.persistCloud(updated, id || undefined, requestContext);
            return updated;
        } catch (error) {
            // Roll the optimistic write back to the previous snapshot (or drop it when new).
            if (existing) {
                await this.cloudLocalDataSource.cacheWrite(existing, requestContext);
            } else if (id) {
                await this.cloudLocalDataSource.cacheDelete(id, requestContext);
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
            return await this.cloudSocketDataSource.deleteCloud(payload, normalizedContext);
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

    /**
     * Keeps invited and owned (subscription) clouds separated on cache writes: a known type is
     * never downgraded, and a brand-new command-path cloud defaults to 'owner'. Invited clouds are
     * seeded via the invited-cloud recovery flow with an explicit 'invited' type (and are the only
     * kind `useInvitedClouds` should observe), so they always pre-exist here — a plain default of
     * 'invited' in the local source would otherwise mislabel owned clouds mirrored by get/update.
     */
    private resolveCloudType(result: Partial<DomainCloud>, existing: DomainCloud | null): DomainCloud['cloudType'] {
        return result.cloudType ?? existing?.cloudType ?? 'owner';
    }

    /**
     * Writes a get/update result into the local cache, merging over the existing entry and
     * preserving its cloud type. No-op when neither the result nor the payload yields an id.
     */
    private async persistCloud(
        result: DomainCloud,
        fallbackId: string | undefined,
        context: DataContext
    ): Promise<void> {
        const id = result.id || fallbackId;
        if (!id) return;
        const existing = await this.cloudLocalDataSource.cacheRead(id, context);
        await this.cloudLocalDataSource.cacheWrite(
            {
                ...result,
                id,
                cid: result.cid || existing?.cid || id,
                cloudType: this.resolveCloudType(result, existing),
            },
            context
        );
    }
}
