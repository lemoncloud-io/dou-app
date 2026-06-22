import type { CloudGateway } from '@lemoncloud/chatic-sockets-lib';
import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';

export interface ICloudRemoteDataSource {
    updateCloud(payload: CloudUpdateInput): Promise<unknown>;
}

export class CloudRemoteDataSource implements ICloudRemoteDataSource {
    constructor(private readonly gateway: CloudGateway) {}

    public async updateCloud(payload: CloudUpdateInput): Promise<unknown> {
        return this.gateway.update(payload);
    }
}
