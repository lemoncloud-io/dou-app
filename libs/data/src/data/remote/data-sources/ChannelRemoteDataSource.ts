import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ISocketClient } from '../sockets/clients/clients';
import type {
    ChatMineInput,
    ChannelSyncInput,
    ChatUpdateChannelInput,
    ChatDeleteChannelInput,
    ChatStartInput,
    ChatInviteInput,
    ChatLeaveInput,
} from '@lemoncloud/chatic-sockets-api';

export interface IChannelRemoteDataSource {
    /** 내가 참여 중인 채널 목록을 서버에 요청합니다. */
    fetchChannel(payload: ChatMineInput): Promise<unknown>;
    /** 채널 동기화를 서버에 요청합니다. */
    syncChannel(payload: ChannelSyncInput): Promise<unknown>;
    /** 채널의 정보(이름, 설정 등) 수정을 요청합니다. */
    updateChannel(payload: ChatUpdateChannelInput): Promise<unknown>;
    /** 채널 삭제(또는 종료)를 요청합니다. */
    deleteChannel(payload: ChatDeleteChannelInput): Promise<unknown>;
    /** 새로운 채팅방을 시작하거나 초기 상태를 요청합니다. */
    startChat(payload: ChatStartInput): Promise<unknown>;
    /** 채널에 특정 유저를 초대합니다. */
    inviteChannel(payload: ChatInviteInput): Promise<unknown>;
    /** 채널에서 나갑니다. */
    leaveChannel(payload: ChatLeaveInput): Promise<unknown>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class ChannelRemoteDataSource implements IChannelRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}
    1;
    public async fetchChannel(payload: ChatMineInput): Promise<unknown> {
        return this.client.request('channel.mine', payload);
    }

    public async syncChannel(payload: ChannelSyncInput): Promise<unknown> {
        return this.client.request('channel.sync', payload);
    }

    public async updateChannel(payload: ChatUpdateChannelInput): Promise<unknown> {
        return this.client.request('channel.update', payload);
    }

    public async deleteChannel(payload: ChatDeleteChannelInput): Promise<unknown> {
        return this.client.request('channel.delete', payload);
    }

    public async startChat(payload: ChatStartInput): Promise<unknown> {
        return this.client.request('channel.create', payload);
    }

    public async inviteChannel(payload: ChatInviteInput): Promise<unknown> {
        return this.client.request('channel.invite', payload);
    }

    public async leaveChannel(payload: ChatLeaveInput): Promise<unknown> {
        return this.client.request('channel.leave', payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `channel:${action}` as 'channel:create' | 'channel:update' | 'channel:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
