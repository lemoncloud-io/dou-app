import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { CloudBody, CloudVerifyEmailBody, CloudVerifyEmailView } from '@lemoncloud/chatic-backend-api';
import type { DomainCloud, DomainListResult, DomainMiniApp, MiniAppInput, MiniAppPatch } from '../domain';
import { createDomainListResult } from '../domain';
import type { ICloudLocalDataSource } from '../local/data-sources';
import type { CloudGetInput, ICloudSocketDataSource } from '../remote/socket-data-sources';
import type {
    CloudMakeOptions,
    CloudReleaseOptions,
    ICloudHttpDataSource,
    IMiniAppHttpDataSource,
} from '../remote/http-data-sources';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface ICloudRepository extends DisposableRepository {
    observeList(callback: (result: DomainListResult<DomainCloud> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainCloud | null) => void): () => void;

    /**
     * Reads a cloud from the relay and, by default, writes its name into the local cache. `cache: false`
     * reads only — for a cloud that must not get a cache row, which every row there is classified as
     * owned or invited and a paired cloud is neither.
     */
    getCloud(payload: CloudGetInput, opts?: CloudGetOptions): Promise<DomainCloud>;
    updateCloud(payload: CloudUpdateInput): Promise<DomainCloud>;

    cacheRead(id: string): Promise<DomainCloud | null>;
    cacheReadList(): Promise<DomainListResult<DomainCloud> | null>;
    cacheWrite(item: Partial<DomainCloud>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;

    /**
     * HTTP catalog/command surface (ADR-0070 decision 5, late stage 2). `ICloudHttpDataSource` injection
     * is optional through stage 2 — existing `createRepositories` call sites stay green without
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
    /**
     * Asks the relay for a workspace slot again, for a cloud whose setup failed. The relay accepts it
     * only while the cloud is still `init` or `error` and only from its owner; a refusal, or a slot
     * request that fails again, rejects. The returned row is not the catalog's — re-read the catalog.
     */
    retryCloudSetup(cloudId: string): Promise<DomainCloud>;
    /**
     * The cloud's mini app link — one address its owner sets, `''` when none. Read from the relay's
     * view of the cloud, which members get too. Like the catalog it never touches the local cache;
     * react-query owns it.
     */
    fetchMiniAppUrl(cloudId: string): Promise<string>;
    /**
     * Store the cloud's mini app link, `''` to clear it. The relay takes it from the cloud's owner (or
     * an admin) and refuses anyone else; it does not check the address, so the caller does.
     */
    saveMiniAppUrl(cloudId: string, url: string): Promise<string>;

    /**
     * The cloud's mini apps — the relay's list of names and addresses its owner registered, unlike the
     * single link above (`fetchMiniAppUrl` / `saveMiniAppUrl`), which goes once the screens have moved to
     * this list. In the order they were added and with every status: what a member may see is the
     * caller's to filter. Never touches the local cache; react-query owns it.
     */
    listMiniApps(cloudId: string): Promise<DomainMiniApp[]>;
    /**
     * Register a mini app on a cloud — its owner's (or an admin's) to do. A refusal for one of the save
     * rule's reasons rejects with `MiniAppSaveRefused`; anything else rejects as it came.
     */
    addMiniApp(cloudId: string, input: MiniAppInput): Promise<DomainMiniApp>;
    /** Change a mini app's name, address or switch; refusals as for `addMiniApp`. */
    updateMiniApp(id: string, patch: MiniAppPatch): Promise<DomainMiniApp>;
    /** Remove a mini app from its cloud's list. */
    removeMiniApp(id: string): Promise<void>;
}

export interface CloudGetOptions {
    /** `false` skips the cache write. Default `true`. */
    cache?: boolean;
}

const resolveCloudId = (payload: unknown): string | undefined => {
    const candidate = payload as { id?: string; cid?: string };
    return candidate?.id || candidate?.cid || undefined;
};

/**
 * Local-first cloud facade: reads stay on the local cache while remote get/update/delete
 * commands keep that cache in sync. Clouds are classified via `cloudType` ('invited' | 'owner').
 */
export class CloudRepository extends BaseRepository implements ICloudRepository {
    constructor(
        private readonly cloudSocketDataSource: ICloudSocketDataSource,
        private readonly cloudLocalDataSource: ICloudLocalDataSource,
        contextProvider: DataContextProvider,
        private readonly cloudHttpDataSource?: ICloudHttpDataSource,
        private readonly miniAppHttpDataSource?: IMiniAppHttpDataSource
    ) {
        super(contextProvider);
    }

    private requireMiniAppHttp(): IMiniAppHttpDataSource {
        if (!this.miniAppHttpDataSource) {
            throw new Error('[CloudRepository] IMiniAppHttpDataSource is not injected — httpFactory not wired yet.');
        }
        return this.miniAppHttpDataSource;
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

    public async listMiniApps(cloudId: string): Promise<DomainMiniApp[]> {
        return this.requireMiniAppHttp().listMiniApps(cloudId);
    }

    public async addMiniApp(cloudId: string, input: MiniAppInput): Promise<DomainMiniApp> {
        return this.requireMiniAppHttp().addMiniApp(cloudId, input);
    }

    public async updateMiniApp(id: string, patch: MiniAppPatch): Promise<DomainMiniApp> {
        return this.requireMiniAppHttp().updateMiniApp(id, patch);
    }

    public async removeMiniApp(id: string): Promise<void> {
        return this.requireMiniAppHttp().removeMiniApp(id);
    }

    public observeList(callback: (result: DomainListResult<DomainCloud> | null) => void): () => void {
        return this.cloudLocalDataSource.observeList(undefined, callback as any, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainCloud | null) => void): () => void {
        return this.cloudLocalDataSource.observeItem(id, callback as any, this.getRepositoryContext());
    }

    public async getCloud(payload: CloudGetInput, opts?: CloudGetOptions): Promise<DomainCloud> {
        // Capture the request-time context so a late response never pollutes a switched scope.
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const cloud = await this.cloudSocketDataSource.getCloud(payload, normalizedContext);
        if (opts?.cache === false) return cloud;
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
     * Writes the NAME of a get/update result into the local cache, over the existing entry and
     * preserving its cloud type. No-op when neither the result nor the payload yields an id.
     *
     * Only the name is taken. The answer is the relay's catalog view, which also carries the owner's
     * head and email; an invited row keeps its inviter there, and the name is all the cache is read
     * for. The row also keeps its own `cid`: a cloud view carries none, so the mapper fills
     * `result.cid` from the request context — the cloud that was active, which is a different cloud
     * whenever another one is read or renamed from there.
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
                id,
                cid: existing?.cid || id,
                ...(result.name ? { name: result.name } : {}),
                cloudType: this.resolveCloudType(result, existing),
            },
            context
        );
    }
}
