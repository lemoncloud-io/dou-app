import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { CloudBody, CloudVerifyEmailBody, CloudVerifyEmailView } from '@lemoncloud/chatic-backend-api';
import type { DomainCloud, DomainListResult, DomainMiniApp, MiniAppInput, MiniAppPatch } from '../domain';
import { createDomainListResult } from '../domain';
import type { ICloudLocalDataSource } from '../local/data-sources';
import type { CloudGetInput, ICloudSocketDataSource, IMiniAppSocketDataSource } from '../remote/socket-data-sources';
import type { CloudMakeOptions, CloudReleaseOptions, ICloudHttpDataSource } from '../remote/http-data-sources';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface ICloudRepository extends DisposableRepository {
    observeList(callback: (result: DomainListResult<DomainCloud> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainCloud | null) => void): () => void;

    getCloud(payload: CloudGetInput, opts?: CloudGetOptions): Promise<DomainCloud>;
    updateCloud(payload: CloudUpdateInput): Promise<DomainCloud>;

    cacheRead(id: string): Promise<DomainCloud | null>;
    cacheReadList(): Promise<DomainListResult<DomainCloud> | null>;
    cacheWrite(item: Partial<DomainCloud>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;

    fetchCloudCatalog(params?: Record<string, unknown>): Promise<DomainListResult<DomainCloud>>;
    verifyCloudEmail(body: CloudVerifyEmailBody, opts?: { dryRun?: boolean }): Promise<CloudVerifyEmailView>;
    makeCloud(body: CloudBody, opts?: CloudMakeOptions): Promise<DomainCloud>;
    releaseCloud(cloudId: string, opts?: CloudReleaseOptions): Promise<DomainCloud>;
    retryCloudSetup(cloudId: string): Promise<DomainCloud>;
    fetchMiniAppUrl(cloudId: string): Promise<string>;
    saveMiniAppUrl(cloudId: string, url: string): Promise<string>;

    listMiniApps(cloudId: string): Promise<DomainMiniApp[]>;
    addMiniApp(cloudId: string, input: MiniAppInput): Promise<DomainMiniApp>;
    updateMiniApp(id: string, patch: MiniAppPatch): Promise<DomainMiniApp>;
    removeMiniApp(id: string): Promise<void>;
}

export interface CloudGetOptions {
    cache?: boolean;
}

const resolveCloudId = (payload: unknown): string | undefined => {
    const candidate = payload as { id?: string; cid?: string };
    return candidate?.id || candidate?.cid || undefined;
};

export class CloudRepository extends BaseRepository implements ICloudRepository {
    constructor(
        private readonly cloudSocketDataSource: ICloudSocketDataSource,
        private readonly cloudLocalDataSource: ICloudLocalDataSource,
        contextProvider: DataContextProvider,
        private readonly cloudHttpDataSource?: ICloudHttpDataSource,
        private readonly miniAppSocketDataSource?: IMiniAppSocketDataSource
    ) {
        super(contextProvider);
    }

    private requireMiniApps(): IMiniAppSocketDataSource {
        if (!this.miniAppSocketDataSource) {
            throw new Error(
                '[CloudRepository] IMiniAppSocketDataSource is not injected — socketFactory not wired yet.'
            );
        }
        return this.miniAppSocketDataSource;
    }

    private requireHttp(): ICloudHttpDataSource {
        if (!this.cloudHttpDataSource) {
            throw new Error('[CloudRepository] ICloudHttpDataSource is not injected — httpFactory not wired yet.');
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

    public async retryCloudSetup(cloudId: string): Promise<DomainCloud> {
        return this.requireHttp().retryCloudSetup(cloudId, this.getRequestContext());
    }

    public async fetchMiniAppUrl(cloudId: string): Promise<string> {
        return this.requireHttp().fetchMiniAppUrl(cloudId);
    }

    public async saveMiniAppUrl(cloudId: string, url: string): Promise<string> {
        return this.requireHttp().saveMiniAppUrl(cloudId, url);
    }

    public async listMiniApps(_cloudId: string): Promise<DomainMiniApp[]> {
        return this.requireMiniApps().listMiniApps();
    }

    public async addMiniApp(_cloudId: string, input: MiniAppInput): Promise<DomainMiniApp> {
        return this.requireMiniApps().addMiniApp(input);
    }

    public async updateMiniApp(id: string, patch: MiniAppPatch): Promise<DomainMiniApp> {
        return this.requireMiniApps().updateMiniApp(id, patch);
    }

    public async removeMiniApp(id: string): Promise<void> {
        return this.requireMiniApps().removeMiniApp(id);
    }

    public observeList(callback: (result: DomainListResult<DomainCloud> | null) => void): () => void {
        return this.cloudLocalDataSource.observeList(undefined, callback as any, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainCloud | null) => void): () => void {
        return this.cloudLocalDataSource.observeItem(id, callback as any, this.getRepositoryContext());
    }

    public async getCloud(payload: CloudGetInput, opts?: CloudGetOptions): Promise<DomainCloud> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const cloud = await this.cloudSocketDataSource.getCloud(payload, normalizedContext);
        if (opts?.cache === false) return cloud;
        await this.persistCloud(cloud, resolveCloudId(payload), requestContext);
        return cloud;
    }

    public async updateCloud(payload: CloudUpdateInput): Promise<DomainCloud> {
        const id = resolveCloudId(payload) || '';
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = id ? await this.cloudLocalDataSource.cacheRead(id, requestContext) : null;

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
            await this.persistCloud(updated, id || undefined, requestContext);
            return updated;
        } catch (error) {
            if (existing) {
                await this.cloudLocalDataSource.cacheWrite(existing, requestContext);
            } else if (id) {
                await this.cloudLocalDataSource.cacheDelete(id, requestContext);
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

    public cacheDelete(id: string): Promise<void> {
        return this.cloudLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.cloudLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    private resolveCloudType(result: Partial<DomainCloud>, existing: DomainCloud | null): DomainCloud['cloudType'] {
        return result.cloudType ?? existing?.cloudType ?? 'owner';
    }

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
                id,
                cid: existing?.cid || id,
                ...(result.name ? { name: result.name } : {}),
                cloudType: this.resolveCloudType(result, existing),
            },
            context
        );
    }
}
