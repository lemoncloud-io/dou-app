import type { UserView } from '@lemoncloud/chatic-socials-api';
import type { ChatUsersPayload, UserInvitePayload, UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '../events/types';
import type { IUserRemoteDataSource } from '../remote/data-sources';
import type { SocketRequestManager } from '../remote/sockets/SocketRequestManager';
import { BaseRepository, type RepositoryRequestOptions, type RepositoryRuntime } from './types';

/** user:update-profile 서버 요청 payload입니다. */
export type UserProfileUpdatePayload = UserUpdateProfilePayload;
/** user:invite 서버 요청 payload입니다. */
export type UserInviteRequestPayload = UserInvitePayload;
/** user:invite 서버 응답 모델입니다. */
export type UserInviteResult = MyInviteView;

/**
 * 사용자 도메인의 Repository 공개 계약입니다.
 * 사용자 목록 조회, 채널 초대, 내 프로필 수정, 외부 초대 코드 생성을 담당합니다.
 */
export interface IUserRepository {
    /** 특정 채널 또는 조건에 맞는 사용자 목록을 조회합니다. */
    fetchUsers(payload: ChatUsersPayload, options?: RepositoryRequestOptions): Promise<ListResult<UserView>>;
    /** 내 사용자 프로필 정보를 수정합니다. */
    updateProfile(payload: UserProfileUpdatePayload, options?: RepositoryRequestOptions): Promise<UserView>;
    /** 외부 사용자 초대 코드를 생성합니다. */
    requestInvite(payload: UserInviteRequestPayload, options?: RepositoryRequestOptions): Promise<UserInviteResult>;
}

/**
 * UserRemoteDataSource를 감싸는 사용자 Repository 구현체입니다.
 * chat 도메인에 걸친 사용자 조회/초대 요청도 사용자 API로 묶어 노출합니다.
 */
export class UserRepository extends BaseRepository implements IUserRepository {
    constructor(
        private readonly userDataSource: IUserRemoteDataSource,
        requestManager: SocketRequestManager,
        runtime?: RepositoryRuntime
    ) {
        super(requestManager, runtime);
    }

    /** chat:users 요청을 수행하고 응답을 기다립니다. */
    public fetchUsers(payload: ChatUsersPayload, options?: RepositoryRequestOptions): Promise<ListResult<UserView>> {
        return this.requestRemote(ref => this.userDataSource.fetchUsers(payload, ref), options);
    }

    /** user:update-profile 요청을 수행하고 응답을 기다립니다. */
    public updateProfile(payload: UserProfileUpdatePayload, options?: RepositoryRequestOptions): Promise<UserView> {
        return this.requestRemote(ref => this.userDataSource.updateProfile(payload, ref), options);
    }

    /** user:invite 요청을 수행하고 정규화된 초대 결과를 기다립니다. (== 유저 생성) */
    public requestInvite(
        payload: UserInviteRequestPayload,
        options?: RepositoryRequestOptions
    ): Promise<UserInviteResult> {
        return this.requestRemote(ref => this.userDataSource.requestInvite(payload, ref), options);
    }
}
