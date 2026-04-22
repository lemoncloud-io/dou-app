import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { ChatReadPayload, ChatUpdateJoinPayload } from '@lemoncloud/chatic-sockets-api';

export interface IJoinRemoteDataSource {
    /** 특정 메시지까지 읽었음을 서버에 알리고 참여 정보를 동기화합니다. */
    readChat(payload: ChatReadPayload, ref?: string): void;
    /** 참여 정보(예: 알림 설정 변경)를 수정합니다. */
    updateJoin(payload: ChatUpdateJoinPayload, ref?: string): void;
}

export class JoinRemoteDataSource implements IJoinRemoteDataSource {
    constructor(
        private readonly socketEventBus: IEventBus<SocketEventMap>,
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly wssClient: IWebSocketClient
    ) {
        this.initializeListeners();
    }

    private initializeListeners() {
        // chat:read 이벤트는 도메인 계층에서 join:update 로직으로 통합 처리됩니다.
        this.socketEventBus.on('chat:read', detail => {
            this.domainEventBus.emit('join:update', {
                data: detail.payload as JoinView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('join:update', detail => {
            this.domainEventBus.emit('join:update', {
                data: detail.payload as JoinView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('join:delete', detail => {
            this.domainEventBus.emit('join:delete', {
                data: detail.payload as JoinView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('join:error', detail => {
            this.domainEventBus.emit('error', {
                domain: 'join',
                message: detail.payload.error || 'Join Error',
                ref: detail.ref,
            });
        });
    }

    public readChat(payload: ChatReadPayload, ref?: string) {
        this.wssClient.send('chat', 'read', payload, ref);
    }

    public updateJoin(payload: ChatUpdateJoinPayload, ref?: string) {
        this.wssClient.send('chat', 'update-join', payload, ref);
    }
}
