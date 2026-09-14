import type { JoinSocketDomainGateway } from '../gateways';
import type { ChannelJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { JoinGetInput } from '@lemoncloud/chatic-sockets-lib';
// Use the explicit join-domain alias: the bare `JoinUpdateInput` barrel name now resolves to the
// channel variant, but gateway.update expects the JOIN body ({ id, ... }).
import type { JoinDomainUpdateInput as JoinUpdateInput } from '@lemoncloud/chatic-sockets-lib';
import type { DomainJoin } from '../../domain';
import { toDomainJoin } from '../../domain';
import type { DataContext } from '../../repositories/types';

export interface IJoinSocketDataSource {
    /** Reads a single join snapshot (`join.get`). Used by JoinSyncPlan polling and the refresh path. */
    getJoin(payload: JoinGetInput, context: DataContext): Promise<DomainJoin>;
    /** Tells the server messages have been read up to a point and syncs the join information. */
    readChat(payload: ChatReadInput, context: DataContext): Promise<DomainJoin>;
    /** Updates the join information (a notification setting, for instance). */
    updateJoin(payload: JoinUpdateInput, context: DataContext): Promise<DomainJoin>;
    /** Sends a request to join a channel. */
    joinChannel(payload: ChannelJoinInput, context: DataContext): Promise<DomainJoin>;
}

/**
 * Join remote source. Single boundary where join API views become domain
 * models; callers receive domain shapes only. The request-time `context`
 * is supplied by the caller to keep a late response on its original scope.
 */
export class JoinSocketDataSource implements IJoinSocketDataSource {
    constructor(private readonly gateway: JoinSocketDomainGateway) {}

    public async getJoin(payload: JoinGetInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.get<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }

    public async readChat(payload: ChatReadInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.read<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }

    public async updateJoin(payload: JoinUpdateInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.update<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }

    public async joinChannel(payload: ChannelJoinInput, context: DataContext): Promise<DomainJoin> {
        const remote = await this.gateway.join<JoinView>(payload);
        return toDomainJoin((remote || {}) as JoinView, context);
    }
}
