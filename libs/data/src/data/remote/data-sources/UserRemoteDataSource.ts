import type { UserView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, ListResult, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { ChatUsersPayload, UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';

export interface IUserRemoteDataSource {
    /** 특정 조건의 사용자 목록을 서버에 요청합니다. */
    fetchUsers(payload: ChatUsersPayload, ref?: string): void;

    /** 내 프로필 정보 수정을 요청합니다. */
    updateProfile(payload: UserUpdateProfilePayload, ref?: string): void;

    /** 외부 사용자를 초대하고 초대 결과를 요청합니다. */
    requestInvite(payload: MyUserInviteBody, ref?: string): void;

    /** 여러 사용자를 일괄 초대합니다. */
    requestInviteBatch(payload: MyUserInviteBody, ref?: string): void;
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
        this.socketEventBus.on('user:create', detail => {
            this.domainEventBus.emit('user:create', {
                data: detail.payload as UserView,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('user:update', detail => {
            this.domainEventBus.emit('user:update', {
                data: detail.payload as UserView,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('user:read', detail => {
            this.domainEventBus.emit('user:list', {
                data: detail.payload as ListResult<UserView>,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('user:delete', detail => {
            this.domainEventBus.emit('user:delete', {
                data: detail.payload as UserView,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('user:invite', detail => {
            this.domainEventBus.emit('user:invite', {
                data: detail.payload as MyInviteView,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('user:invite-batch', detail => {
            this.domainEventBus.emit('user:invite-batch', {
                data: detail.payload as MyInviteView[],
                ref: detail.ref,
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

    public updateProfile(payload: UserUpdateProfilePayload, ref?: string) {
        this.wssClient.send('user', 'update-profile', payload, ref);
    }

    public requestInvite(payload: MyUserInviteBody, ref?: string) {
        this.wssClient.send('user', 'invite', payload, ref);
    }

    public requestInviteBatch(payload: MyUserInviteBody, ref?: string) {
        this.wssClient.send('user', 'invite-batch', payload, ref);
    }
}
