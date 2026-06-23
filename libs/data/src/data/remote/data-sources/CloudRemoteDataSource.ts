import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { CloudDomainGateway } from '../gateways';

export type CloudGetInput = Parameters<CloudDomainGateway['get']>[0];
export type CloudDeleteInput = Parameters<CloudDomainGateway['delete']>[0];

export interface ICloudRemoteDataSource {
    getCloud(payload: CloudGetInput): Promise<unknown>;
    updateCloud(payload: CloudUpdateInput): Promise<unknown>;
    deleteCloud(payload: CloudDeleteInput): Promise<unknown>;
}

export class CloudRemoteDataSource implements ICloudRemoteDataSource {
    constructor(private readonly gateway: CloudDomainGateway) {}

    public async getCloud(payload: CloudGetInput): Promise<unknown> {
        return this.gateway.get(payload);
    }

    public async updateCloud(payload: CloudUpdateInput): Promise<unknown> {
        return this.gateway.update(payload);
    }

    public async deleteCloud(payload: CloudDeleteInput): Promise<unknown> {
        return this.gateway.delete(payload);
    }
}
