import type {
    ChannelGetSelfInput,
    ChannelSyncInput,
    ChatInviteInput,
    ChatLeaveInput,
} from '@lemoncloud/chatic-sockets-api';
import type {
    ChannelCreateInput,
    ChannelDeleteInput,
    ChannelGetRequestData,
    ChannelMineInput,
    ChannelStartDmInput,
    ChannelUpdateInput,
} from '@lemoncloud/chatic-sockets-api/dist/lib/channel/types';
import type { ChannelSyncView, ChannelView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { DomainChannel, DomainListResult } from '../../domain';
import { createDomainListResult, toDomainChannel } from '../../domain';
import type { DataContext } from '../../repositories/types';
import type { ChannelSocketDomainGateway } from '../gateways';

export interface ChannelSyncResult {
    list: DomainChannel[];
    ids?: string[];
    syncedAt: number;
}

export interface IChannelSocketDataSource {
    fetchChannel(payload: ChannelMineInput, context: DataContext): Promise<DomainListResult<DomainChannel>>;
    updateChannel(payload: ChannelUpdateInput, context: DataContext): Promise<DomainChannel>;
    getChannel(payload: ChannelGetRequestData, context: DataContext): Promise<DomainChannel>;
    deleteChannel(payload: ChannelDeleteInput, context: DataContext): Promise<DomainChannel>;
    createChannel(payload: ChannelCreateInput, context: DataContext): Promise<DomainChannel>;
    startDm(payload: ChannelStartDmInput, context: DataContext): Promise<DomainChannel>;
    inviteChannel(payload: ChatInviteInput, context: DataContext): Promise<DomainChannel>;
    leaveChannel(payload: ChatLeaveInput, context: DataContext): Promise<DomainChannel>;
    syncChannel(payload: ChannelSyncInput, context: DataContext): Promise<ChannelSyncResult>;

    getSelfChannel(payload: ChannelGetSelfInput, context: DataContext): Promise<DomainChannel>;
}

export class ChannelSocketDataSource implements IChannelSocketDataSource {
    constructor(private readonly gateway: ChannelSocketDomainGateway) {}

    public async fetchChannel(
        payload: ChannelMineInput,
        context: DataContext
    ): Promise<DomainListResult<DomainChannel>> {
        const remote = await this.gateway.mine<ListResult<ChannelView>>(payload);
        const list = (remote?.list || []).map(item => toDomainChannel(item, context));
        return createDomainListResult(list, {
            total: remote?.total ?? list.length,
            source: 'remote',
        });
    }

    public async syncChannel(payload: ChannelSyncInput, context: DataContext): Promise<ChannelSyncResult> {
        const remote = await this.gateway.sync<ChannelSyncView>(payload);
        return {
            list: (remote?.list || []).map(item => toDomainChannel(item, context)),
            ids: remote?.ids,
            syncedAt: remote?.syncedAt ?? 0,
        };
    }

    public async getChannel(payload: ChannelGetRequestData, context: DataContext): Promise<DomainChannel> {
        const remote = await this.gateway.get<ChannelView>(payload);
        return toDomainChannel((remote || {}) as ChannelView, context);
    }

    public async updateChannel(payload: ChannelUpdateInput, context: DataContext): Promise<DomainChannel> {
        const remote = await this.gateway.update<ChannelView>(payload);
        return toDomainChannel((remote || {}) as ChannelView, context);
    }

    public async deleteChannel(payload: ChannelDeleteInput, context: DataContext): Promise<DomainChannel> {
        const remote = await this.gateway.delete<ChannelView>(payload);
        return toDomainChannel((remote || {}) as ChannelView, context);
    }

    public async createChannel(payload: ChannelCreateInput, context: DataContext): Promise<DomainChannel> {
        const remote = await this.gateway.create<ChannelView>(payload);
        return toDomainChannel((remote || {}) as ChannelView, context);
    }

    public async startDm(payload: ChannelStartDmInput, context: DataContext): Promise<DomainChannel> {
        const remote = await this.gateway.startDm<ChannelView>(payload);
        return toDomainChannel((remote || {}) as ChannelView, context);
    }

    public async inviteChannel(payload: ChatInviteInput, context: DataContext): Promise<DomainChannel> {
        const remote = await this.gateway.invite<ChannelView>(payload);
        return toDomainChannel((remote || {}) as ChannelView, context);
    }

    public async leaveChannel(payload: ChatLeaveInput, context: DataContext): Promise<DomainChannel> {
        const remote = await this.gateway.leave<ChannelView>(payload);
        return toDomainChannel((remote || {}) as ChannelView, context);
    }

    public async getSelfChannel(payload: ChannelGetSelfInput, context: DataContext): Promise<DomainChannel> {
        const remote = await this.gateway.getSelf<ChannelView>(payload);
        return toDomainChannel((remote || {}) as ChannelView, context);
    }
}
