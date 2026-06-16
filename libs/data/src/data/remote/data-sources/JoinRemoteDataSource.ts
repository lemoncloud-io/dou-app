import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ISocketClient } from '../sockets/clients';
import type { ChannelJoinInput, ChannelUpdateJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

export interface IJoinRemoteDataSource {
    /** 특정 메시지까지 읽었음을 서버에 알리고 참여 정보를 동기화합니다. */
    readChat(payload: ChatReadInput): Promise<JoinView>;
    /** 참여 정보(예: 알림 설정 변경)를 수정합니다. */
    updateJoin(payload: ChannelUpdateJoinInput): Promise<JoinView>;
    /** 채널에 참여 요청을 보냅니다. */
    joinChannel(payload: ChannelJoinInput): Promise<JoinView>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class JoinRemoteDataSource implements IJoinRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}

    public async readChat(payload: ChatReadInput): Promise<JoinView> {
        return (await this.client.request('chat.read', payload)) as Promise<JoinView>;
    }

    public async updateJoin(payload: ChannelUpdateJoinInput): Promise<JoinView> {
        return (await this.client.request('channel.update-join', payload)) as Promise<JoinView>;
    }

    public async joinChannel(payload: ChannelJoinInput): Promise<JoinView> {
        return (await this.client.request('channel.join', payload)) as Promise<JoinView>;
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `join:${action}` as 'join:create' | 'join:update' | 'join:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
