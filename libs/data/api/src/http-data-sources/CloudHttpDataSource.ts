import type { CloudBody, CloudVerifyEmailBody, CloudVerifyEmailView } from '@lemoncloud/chatic-backend-api';
import type { DomainCloud, DomainListResult } from '@chatic/data-model';
import { createDomainListResult, toDomainCloud } from '@chatic/data-model';
import type { DataContext } from '@chatic/data-model';
import type { CloudHttpDomainGateway } from '../gateways';

export interface CloudMakeOptions {
    dryRun?: boolean;
}

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
    fetchMiniAppUrl(cloudId: string): Promise<string>;
    saveMiniAppUrl(cloudId: string, url: string): Promise<string>;
}

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

    async fetchMiniAppUrl(cloudId: string): Promise<string> {
        const view = await this.gateway.get(cloudId);
        if (!view) throw new Error(`[CloudHttpDataSource] no cloud view for ${cloudId}`);
        return view.miniAppUrl ?? '';
    }

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
