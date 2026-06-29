import type { SocketDomainGateway } from '../gateways';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';
import type { ConnectionModel } from '@lemoncloud/chatic-sockets-api/dist/modules/sockets/model';

export interface ISocketsRemoteDataSource {
    findConnection(payload: SocketsFindConnectionInput): Promise<ConnectionModel>;
}

export class SocketsRemoteDataSource implements ISocketsRemoteDataSource {
    constructor(private readonly gateway: SocketDomainGateway) {}

    public async findConnection(payload: SocketsFindConnectionInput): Promise<ConnectionModel> {
        return this.gateway.request('find-connection', payload);
    }
}
