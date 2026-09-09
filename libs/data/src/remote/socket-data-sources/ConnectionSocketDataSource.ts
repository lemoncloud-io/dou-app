import type { ConnectionSocketDomainGateway } from '../gateways';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';
import type { ConnectionModel } from '@lemoncloud/chatic-sockets-api/dist/modules/sockets/model';

export interface IConnectionSocketDataSource {
    findConnection(payload: SocketsFindConnectionInput): Promise<ConnectionModel>;
}

export class ConnectionSocketDataSource implements IConnectionSocketDataSource {
    constructor(private readonly gateway: ConnectionSocketDomainGateway) {}

    public async findConnection(payload: SocketsFindConnectionInput): Promise<ConnectionModel> {
        return this.gateway.request('find-connection', payload);
    }
}
