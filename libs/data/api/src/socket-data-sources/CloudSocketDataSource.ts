import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { DomainCloud } from '@chatic/data-model';
import { toDomainCloud } from '@chatic/data-model';
import type { DataContext } from '@chatic/data-model';
import type { CloudSocketDomainGateway } from '../gateways';

export type CloudGetInput = Parameters<CloudSocketDomainGateway['get']>[0];

export interface ICloudSocketDataSource {
    getCloud(payload: CloudGetInput, context: DataContext): Promise<DomainCloud>;
    updateCloud(payload: CloudUpdateInput, context: DataContext): Promise<DomainCloud>;
}

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
}
