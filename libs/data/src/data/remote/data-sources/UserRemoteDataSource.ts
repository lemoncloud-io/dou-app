import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ISocketClient } from '../sockets/clients/clients';
import type {
    ChatUsersInput,
    UserUpdateProfileInput,
    UserInviteInput,
    UserInviteBatchInput,
} from '@lemoncloud/chatic-sockets-api';

export interface IUserRemoteDataSource {
    /** 특정 조건의 사용자 목록을 서버에 요청합니다. */
    fetchUsers(payload: ChatUsersInput): Promise<unknown>;
    /** 내 프로필 정보 수정을 요청합니다. */
    updateProfile(payload: UserUpdateProfilePayload): Promise<unknown>;
    /** 외부 사용자를 초대하고 초대 결과를 요청합니다. */
    requestInvite(payload: UserInviteInput): Promise<unknown>;
    /** 여러 사용자를 일괄 초대합니다. */
    requestInviteBatch(payload: UserInviteBatchInput): Promise<unknown>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

// UserUpdateProfilePayload alias to UserUpdateProfileInput if needed or just use UserUpdateProfileInput
export type UserUpdateProfilePayload = UserUpdateProfileInput;

export class UserRemoteDataSource implements IUserRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}

    public async fetchUsers(payload: ChatUsersInput): Promise<unknown> {
        return this.client.request('channel.list-user', payload);
    }

    public async updateProfile(payload: UserUpdateProfileInput): Promise<unknown> {
        return this.client.request('user.update-profile', payload);
    }

    public async requestInvite(payload: UserInviteInput): Promise<unknown> {
        return this.client.request('user.invite', payload);
    }

    public async requestInviteBatch(payload: UserInviteBatchInput): Promise<unknown> {
        return this.client.request('user.invite-batch', payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `user:${action}` as 'user:create' | 'user:update' | 'user:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
