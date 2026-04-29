import type { UserView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, ListResult, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { ChatInvitePayload, ChatUsersPayload } from '@lemoncloud/chatic-sockets-api';

export interface IUserRemoteDataSource {
    /** 특정 조건의 사용자 목록을 서버에 요청합니다. */
    fetchUsers(payload: ChatUsersPayload, ref?: string): void;

    /** 사용자를 채널로 초대합니다. */
    inviteUser(payload: ChatInvitePayload, ref?: string): void;
}

export class UserRemoteDataSource implements IUserRemoteDataSource {
    constructor(
        private readonly socketEventBus: IEventBus<SocketEventMap>,
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly wssClient: IWebSocketClient
    ) {
        this.initializeListeners();
    }

    private initializeListeners() {
        this.socketEventBus.on('user:update', detail => {
            this.domainEventBus.emit('user:update', {
                data: detail.payload as UserView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('user:read', detail => {
            this.domainEventBus.emit('user:list', {
                data: detail.payload as ListResult<UserView>,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('user:error', detail => {
            this.domainEventBus.emit('error', {
                domain: 'user',
                message: detail.payload.error || 'Unknown User Error',
                ref: detail.ref,
            });
        });
    }

    public fetchUsers(payload: ChatUsersPayload, ref?: string) {
        this.wssClient.send('chat', 'users', payload, ref);
    }

    public inviteUser(payload: ChatInvitePayload, ref?: string) {
        this.wssClient.send('chat', 'invite', payload, ref);
    }
}
