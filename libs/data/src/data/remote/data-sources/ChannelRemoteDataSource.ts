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
    ChannelUpdateInput,
} from '@lemoncloud/chatic-sockets-api/dist/lib/channel/types';
import type { ChannelSyncView, ChannelView, UnreadsSummaryView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';
import type { DomainChannel, DomainListResult } from '../../domain';
import { createDomainListResult, toDomainChannel } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';
import type { ChannelDomainGateway } from '../gateways';

/** Result of a channel sync: domain rows plus the server's active-id/cursor metadata. */
export interface ChannelSyncResult {
    list: DomainChannel[];
    ids?: string[];
    syncedAt: number;
}

export interface IChannelRemoteDataSource {
    /** 내가 참여 중인 채널 목록을 서버에 요청하고 도메인 모델로 반환합니다. */
    fetchChannel(payload: ChannelMineInput, context: DataContext): Promise<DomainListResult<DomainChannel>>;
    /** 채널의 정보(이름, 설정 등) 수정을 요청합니다. */
    updateChannel(payload: ChannelUpdateInput, context: DataContext): Promise<DomainChannel>;
    /** 채널 삭제(또는 종료)를 요청합니다. */
    deleteChannel(payload: ChannelDeleteInput, context: DataContext): Promise<DomainChannel>;
    /** 새로운 채팅방을 시작하거나 초기 상태를 요청합니다. */
    createChannel(payload: ChannelCreateInput, context: DataContext): Promise<DomainChannel>;
    /** 채널에 특정 유저를 초대합니다. */
    inviteChannel(payload: ChatInviteInput, context: DataContext): Promise<DomainChannel>;
    /** 채널에서 나갑니다. */
    leaveChannel(payload: ChatLeaveInput, context: DataContext): Promise<DomainChannel>;
    /** 채널 동기화를 서버에 요청하고 도메인 모델 목록으로 반환합니다. */
    syncChannel(payload: ChannelSyncInput, context: DataContext): Promise<ChannelSyncResult>;

    /** 자신의 개인(나와의 채팅) 채널 정보를 요청하고 도메인 모델로 반환합니다. */
    getSelfChannel(payload: ChannelGetSelfInput, context: DataContext): Promise<DomainChannel>;
    /** 읽지 않은 메시지 통계를 요청합니다. (도메인 엔티티가 아닌 집계 뷰) */
    getUnreads(payload: ChannelUnreadsInput): Promise<UnreadsSummaryView>;
}

/**
 * Channel remote source. This is the single boundary where channel API views
 * become domain models; callers (repositories) receive domain shapes only.
 * The request-time `context` is passed in by the caller so a late response can
 * never read a switched global scope.
 */
export class ChannelRemoteDataSource implements IChannelRemoteDataSource {
    constructor(private readonly gateway: ChannelDomainGateway) {}

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
