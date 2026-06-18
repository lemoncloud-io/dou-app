import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
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
import type { ChannelGateway } from '@lemoncloud/chatic-sockets-lib';

export interface IChannelRemoteDataSource {
    /** 내가 참여 중인 채널 목록을 서버에 요청합니다. */
    fetchChannel(payload: ChannelMineInput): Promise<ListResult<ChannelView>>;
    /** 채널 동기화를 서버에 요청합니다. */
    syncChannel(payload: ChannelSyncInput): Promise<ChannelSyncView>;
    /** 채널의 정보(이름, 설정 등) 수정을 요청합니다. */
    updateChannel(payload: ChannelUpdateInput): Promise<ChannelView>;
    /** 채널 삭제(또는 종료)를 요청합니다. */
    deleteChannel(payload: ChannelDeleteInput): Promise<ChannelView>;
    /** 새로운 채팅방을 시작하거나 초기 상태를 요청합니다. */
    createChannel(payload: ChannelCreateInput): Promise<ChannelView>;
    /** 채널에 특정 유저를 초대합니다. */
    inviteChannel(payload: ChatInviteInput): Promise<ChannelView>;
    /** 채널에서 나갑니다. */
    leaveChannel(payload: ChatLeaveInput): Promise<ChannelView>;

    /** 자신의 개인 채널 정보를 요청합니다. */
    getSelfChannel(payload: ChannelGetSelfInput): Promise<ChannelView>;
    /** 읽지 않은 메시지 통계를 요청합니다. */
    getUnreads(payload: ChannelUnreadsInput): Promise<UnreadsSummaryView>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class ChannelRemoteDataSource implements IChannelRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly gateway: ChannelGateway
    ) {}

    public async fetchChannel(payload: ChannelMineInput): Promise<ListResult<ChannelView>> {
        return this.gateway.mine(payload);
    }

    public async syncChannel(payload: ChannelSyncInput): Promise<ChannelSyncView> {
        return this.gateway.sync(payload);
    }

    public async updateChannel(payload: ChannelUpdateInput): Promise<ChannelView> {
        return this.gateway.update(payload);
    }

    public async deleteChannel(payload: ChannelDeleteInput): Promise<ChannelView> {
        return this.gateway.delete(payload);
    }

    public async createChannel(payload: ChannelCreateInput): Promise<ChannelView> {
        return this.gateway.create(payload);
    }

    public async inviteChannel(payload: ChatInviteInput): Promise<ChannelView> {
        return this.gateway.invite(payload);
    }

    public async leaveChannel(payload: ChatLeaveInput): Promise<ChannelView> {
        return this.gateway.leave(payload);
    }

    public async getSelfChannel(payload: ChannelGetSelfInput): Promise<ChannelView> {
        return this.gateway.getSelf(payload);
    }

    public async getUnreads(payload: ChannelUnreadsInput): Promise<UnreadsSummaryView> {
        return this.gateway.unreads(payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `channel:${action}` as 'channel:create' | 'channel:update' | 'channel:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
