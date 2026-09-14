import type { CloudBody, CloudVerifyEmailBody, CloudVerifyEmailView } from '@lemoncloud/chatic-backend-api';
import type { DomainCloud, DomainListResult } from '../../domain';
import { createDomainListResult, toDomainCloud } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';
import type { CloudHttpDomainGateway } from '../gateways';

/** `auto=1` is already pinned by the gateway; `dryRun` is the only caller-chosen make flag. */
export interface CloudMakeOptions {
    dryRun?: boolean;
}

/** `cascade` also drops the cloud's dependent records, not just the cloud row. */
export interface CloudReleaseOptions {
    cascade?: boolean;
}

export interface ICloudHttpDataSource {
    listClouds(
        params: Record<string, unknown> | undefined,
        context: DataContext
    ): Promise<DomainListResult<DomainCloud>>;
    updateCloud(cloudId: string, body: CloudBody, context: DataContext): Promise<DomainCloud>;
    makeCloud(body: CloudBody, context: DataContext, opts?: CloudMakeOptions): Promise<DomainCloud>;
    releaseCloud(cloudId: string, context: DataContext, opts?: CloudReleaseOptions): Promise<DomainCloud>;
    verifyEmail(body: CloudVerifyEmailBody, opts?: { dryRun?: boolean }): Promise<CloudVerifyEmailView>;
}

/**
 * Cloud catalog HTTP source. View → domain mapping is the single boundary here, same as the socket
 * `CloudSocketDataSource`. **No local cache write** — the catalog list mixes invited and owned
 * clouds, and `CloudRepositoryV2.resolveCloudType` would default every new entry to `'owner'`,
 * mislabeling invited clouds. React-query owns this read's cache (ADR-0070 결정 5 원칙 6).
 */
export class CloudHttpDataSource implements ICloudHttpDataSource {
    constructor(private readonly gateway: CloudHttpDomainGateway) {}

    async listClouds(
        params: Record<string, unknown> | undefined,
        context: DataContext
    ): Promise<DomainListResult<DomainCloud>> {
        const result = await this.gateway.list(params);
        const list = result.list.map(view => toDomainCloud(view, context));
        return createDomainListResult(list, { total: result.total ?? list.length, source: 'remote' });
    }

    async updateCloud(cloudId: string, body: CloudBody, context: DataContext): Promise<DomainCloud> {
        const view = await this.gateway.update(cloudId, body);
        return toDomainCloud(view, context);
    }

    // The `1`/absent encoding is the wire's, so it stays here rather than in a caller: the app asks
    // for `dryRun: true` and never learns how the relay spells it.
    async makeCloud(body: CloudBody, context: DataContext, opts?: CloudMakeOptions): Promise<DomainCloud> {
        const view = await this.gateway.make(body, opts?.dryRun ? { dryRun: 1 } : undefined);
        return toDomainCloud(view, context);
    }

    async releaseCloud(cloudId: string, context: DataContext, opts?: CloudReleaseOptions): Promise<DomainCloud> {
        const view = await this.gateway.release(cloudId, opts?.cascade ? { cascade: 1 } : undefined);
        return toDomainCloud(view, context);
    }

    verifyEmail(body: CloudVerifyEmailBody, opts?: { dryRun?: boolean }): Promise<CloudVerifyEmailView> {
        return this.gateway.verifyEmail(body, opts);
    }
}
