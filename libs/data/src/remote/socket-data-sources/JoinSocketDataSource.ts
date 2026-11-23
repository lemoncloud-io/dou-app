import type { JoinSocketDomainGateway } from '../gateways';
import type { ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { JoinDomainUpdateInput as JoinUpdateInput } from '@lemoncloud/chatic-sockets-lib';
import type { DomainJoin } from '../../domain';
import { toDomainJoin } from '../../domain';
import type { DataContext } from '../../repositories/types';

export interface IJoinSocketDataSource {
    readChat(payload: ChatReadInput, context: DataContext): Promise<DomainJoin>;
    updateJoin(payload: JoinUpdateInput, context: DataContext): Promise<DomainJoin>;
}

export class JoinSocketDataSource implements IJoinSocketDataSource {
    constructor(private readonly gateway: JoinSocketDomainGateway) {}

    public async readChat(payload: ChatReadInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.read<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }

    public async updateJoin(payload: JoinUpdateInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.update<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }
}
