import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { DomainCloud } from '../../domain';
import { toDomainCloud } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';
import type { CloudSocketDomainGateway } from '../gateways';

export type CloudGetInput = Parameters<CloudSocketDomainGateway['get']>[0];
export type CloudDeleteInput = Parameters<CloudSocketDomainGateway['delete']>[0];

export interface ICloudSocketDataSource {
    getCloud(payload: CloudGetInput, context: DataContext): Promise<DomainCloud>;
    updateCloud(payload: CloudUpdateInput, context: DataContext): Promise<DomainCloud>;
    deleteCloud(payload: CloudDeleteInput, context: DataContext): Promise<DomainCloud>;
}

/**
 * Cloud remote source. Single boundary where cloud API views become domain
 * models; callers receive domain shapes only. The request-time `context`
 * is supplied by the caller to keep a late response on its original scope.
 */
export class CloudSocketDataSource implements ICloudSocketDataSource {
    constructor(private readonly gateway: CloudSocketDomainGateway) {}

    public async getCloud(payload: CloudGetInput, context: DataContext): Promise<DomainCloud> {
        const remote = await this.gateway.get<CloudView>(payload);
        return toDomainCloud((remote || {}) as CloudView, context);
    }

    public async updateCloud(payload: CloudUpdateInput, context: DataContext): Promise<DomainCloud> {
        const remote = await this.gateway.update<CloudView>(payload);
        return toDomainCloud((remote || {}) as CloudView, context);
    }

    public async deleteCloud(payload: CloudDeleteInput, context: DataContext): Promise<DomainCloud> {
        const remote = await this.gateway.delete<CloudView>(payload);
        return toDomainCloud((remote || {}) as CloudView, context);
    }
}
