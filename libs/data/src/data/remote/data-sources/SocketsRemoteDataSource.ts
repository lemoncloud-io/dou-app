import type { ISocketClient } from '../sockets/clients';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';
import type { ConnectionModel } from '@lemoncloud/chatic-sockets-api/dist/modules/sockets/model';

export interface ISocketsRemoteDataSource {
    findConnection(payload: SocketsFindConnectionInput): Promise<ConnectionModel>;
}

export class SocketsRemoteDataSource implements ISocketsRemoteDataSource {
    constructor(private readonly client: ISocketClient) {}

    public async findConnection(payload: SocketsFindConnectionInput): Promise<ConnectionModel> {
        return (await this.client.request('sockets.find-connection', payload)) as Promise<ConnectionModel>;
    }
}
