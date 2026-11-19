import type { CloudBody, CloudVerifyEmailBody, CloudVerifyEmailView } from '@lemoncloud/chatic-backend-api';
import type { DomainCloud, DomainListResult } from '../../domain';
import { createDomainListResult, toDomainCloud } from '../../domain';
import type { DataContext } from '../../repositories/types';
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
    retryCloudSetup(cloudId: string, context: DataContext): Promise<DomainCloud>;
    verifyEmail(body: CloudVerifyEmailBody, opts?: { dryRun?: boolean }): Promise<CloudVerifyEmailView>;
    /** The cloud's mini app link, `''` when it has none. */
    fetchMiniAppUrl(cloudId: string): Promise<string>;
    /** Store the cloud's mini app link (`''` clears it); resolves with what the relay stored. */
    saveMiniAppUrl(cloudId: string, url: string): Promise<string>;
}

/**
 * Cloud catalog HTTP source. View → domain mapping is the single boundary here, same as the socket
 * `CloudSocketDataSource`. **No local cache write** — the catalog list mixes invited and owned
 * clouds, and `CloudRepository.resolveCloudType` would default every new entry to `'owner'`,
 * mislabeling invited clouds. React-query owns this read's cache (ADR-0070 decision 5 principle 6).
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

    async retryCloudSetup(cloudId: string, context: DataContext): Promise<DomainCloud> {
        const view = await this.gateway.workspace(cloudId);
        return toDomainCloud(view, context);
    }

    verifyEmail(body: CloudVerifyEmailBody, opts?: { dryRun?: boolean }): Promise<CloudVerifyEmailView> {
        return this.gateway.verifyEmail(body, opts);
    }

    // The link is read off the cloud's own view, which every caller may read: the owner gets the full
    // view, anyone else the minimal one, and both carry it. The relay does not check the address.
    // An absent field is "no link" (the relay leaves undefined fields out of a view); no view at all is
    // a broken answer, not an empty link, and is thrown so a screen never offers to overwrite a real one.
    async fetchMiniAppUrl(cloudId: string): Promise<string> {
        const view = await this.gateway.get(cloudId);
        if (!view) throw new Error(`[CloudHttpDataSource] no cloud view for ${cloudId}`);
        return view.miniAppUrl ?? '';
    }

    // The body names the link alone: the relay takes nothing else from an owner, and an admin's body
    // would otherwise be written as sent.
    // A save the answer does not carry back was not kept (a relay without the field, or a body it
    // dropped): reported as a failure rather than as a cleared link.
    async saveMiniAppUrl(cloudId: string, url: string): Promise<string> {
        const view = await this.gateway.update(cloudId, { miniAppUrl: url });
        if (!view) throw new Error(`[CloudHttpDataSource] no cloud view for ${cloudId}`);
        const stored = view.miniAppUrl ?? '';
        if (url !== '' && stored === '') {
            throw new Error(`[CloudHttpDataSource] mini app link not stored for ${cloudId}`);
        }
        return stored;
    }
}
