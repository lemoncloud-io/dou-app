import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ISocketClient } from '../sockets/clients/clients';
import type { ChatReadInput, ChannelUpdateJoinInput } from '@lemoncloud/chatic-sockets-api';

export interface IJoinRemoteDataSource {
    /** 특정 메시지까지 읽었음을 서버에 알리고 참여 정보를 동기화합니다. */
    readChat(payload: ChatReadInput): Promise<unknown>;
    /** 참여 정보(예: 알림 설정 변경)를 수정합니다. */
    updateJoin(payload: ChannelUpdateJoinInput): Promise<unknown>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class JoinRemoteDataSource implements IJoinRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}

    public async readChat(payload: ChatReadInput): Promise<unknown> {
        return this.client.request('chat.read', payload);
    }

    public async updateJoin(payload: ChannelUpdateJoinInput): Promise<unknown> {
        return this.client.request('channel.update-join', payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `join:${action}` as 'join:create' | 'join:update' | 'join:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
