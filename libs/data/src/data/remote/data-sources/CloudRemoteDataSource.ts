import type { ISocketClient } from '../sockets/clients';
import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { UpdateCloudResult } from '@lemoncloud/chatic-sockets-api';

export interface ICloudRemoteDataSource {
    updateCloud(payload: CloudUpdateInput): Promise<unknown>;
}

export class CloudRemoteDataSource implements ICloudRemoteDataSource {
    constructor(private readonly client: ISocketClient) {}

    public async updateCloud(payload: CloudUpdateInput): Promise<UpdateCloudResult> {
        return this.client.request('cloud.update', payload);
    }
}
