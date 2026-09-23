import type { JoinSocketDomainGateway } from '../gateways';
import type { ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { JoinView } from '@lemoncloud/chatic-socials-api';
// Use the explicit join-domain alias: the bare `JoinUpdateInput` barrel name now resolves to the
// channel variant, but gateway.update expects the JOIN body ({ id, ... }).
import type { JoinDomainUpdateInput as JoinUpdateInput } from '@lemoncloud/chatic-sockets-lib';
import type { DomainJoin } from '../../domain';
import { toDomainJoin } from '../../domain';
import type { DataContext } from '../../repositories/types';

export interface IJoinSocketDataSource {
    /** Tells the server messages have been read up to a point and syncs the join information. */
    readChat(payload: ChatReadInput, context: DataContext): Promise<DomainJoin>;
    /** Updates the join information (a notification setting, for instance). */
    updateJoin(payload: JoinUpdateInput, context: DataContext): Promise<DomainJoin>;
}

/**
 * Join remote source. Single boundary where join API views become domain
 * models; callers receive domain shapes only. The request-time `context`
 * is supplied by the caller to keep a late response on its original scope.
 */
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
