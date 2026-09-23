import type {
    ChannelGetSelfInput,
    ChannelSyncInput,
    ChannelUnreadsInput,
    ChatInviteInput,
    ChatLeaveInput,
} from '@lemoncloud/chatic-sockets-api';
import type {
    ChannelCreateInput,
    ChannelDeleteInput,
    ChannelMineInput,
    ChannelStartDmInput,
    ChannelUpdateInput,
} from '@lemoncloud/chatic-sockets-api/dist/lib/channel/types';
import type { ChannelSyncView, ChannelView, UnreadsSummaryView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';
import type { DomainChannel, DomainListResult } from '../../domain';
import { createDomainListResult, toDomainChannel } from '../../domain';
import type { DataContext } from '../../repositories/types';
import type { ChannelSocketDomainGateway } from '../gateways';

/** Result of a channel sync: domain rows plus the server's active-id/cursor metadata. */
export interface ChannelSyncResult {
    list: DomainChannel[];
    ids?: string[];
    syncedAt: number;
}

export interface IChannelSocketDataSource {
    /** Requests the list of channels I belong to and returns it as domain models. */
    fetchChannel(payload: ChannelMineInput, context: DataContext): Promise<DomainListResult<DomainChannel>>;
    /** Requests an edit to the channel's information (name, settings, …). */
    updateChannel(payload: ChannelUpdateInput, context: DataContext): Promise<DomainChannel>;
    /** Requests deletion (or closure) of the channel. */
    deleteChannel(payload: ChannelDeleteInput, context: DataContext): Promise<DomainChannel>;
    /** Starts a new room, or requests its initial state. */
    createChannel(payload: ChannelCreateInput, context: DataContext): Promise<DomainChannel>;
    /** Opens the 1:1 with one peer, or returns the existing one. The row comes back with no place. */
    startDm(payload: ChannelStartDmInput, context: DataContext): Promise<DomainChannel>;
    /** Invites a specific user to the channel. */
    inviteChannel(payload: ChatInviteInput, context: DataContext): Promise<DomainChannel>;
    /** Leaves the channel. */
    leaveChannel(payload: ChatLeaveInput, context: DataContext): Promise<DomainChannel>;
    /** Requests a channel sync and returns the result as a list of domain models. */
    syncChannel(payload: ChannelSyncInput, context: DataContext): Promise<ChannelSyncResult>;

    /** Requests one's own personal (self-chat) channel and returns it as a domain model. */
    getSelfChannel(payload: ChannelGetSelfInput, context: DataContext): Promise<DomainChannel>;
    /** Requests unread-message statistics. (An aggregate view, not a domain entity.) */
    getUnreads(payload: ChannelUnreadsInput): Promise<UnreadsSummaryView>;
}

/**
 * Channel remote source. This is the single boundary where channel API views
 * become domain models; callers (repositories) receive domain shapes only.
 * The request-time `context` is passed in by the caller so a late response can
 * never read a switched global scope.
 */
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

    /**
     * A 1:1 opened by peer id, which belongs to the CLOUD rather than to any place.
     *
     * Mapped like any other channel. This response carries no site of its own, so the mapper falls
     * back to the ambient place — and the server's own answer arrives on the next read and replaces
     * it. An earlier version blanked the field here to mean "this room has no place", which the
     * server contradicts on every subsequent read; where a 1:1 may be listed is decided when
     * reading instead (`isInPlaceList`).
     */
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

    public async getUnreads(payload: ChannelUnreadsInput): Promise<UnreadsSummaryView> {
        return this.gateway.unreads(payload);
    }
}
