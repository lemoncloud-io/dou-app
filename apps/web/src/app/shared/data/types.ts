import type {
    IAuthRepository,
    IChannelRepository,
    IChatRepository,
    IInviteCloudRepository,
    IJoinRepository,
    ISiteRepository,
    IUserRepository,
    MutableRepositoryContext,
    RepositoryContext,
    SocketDispatcher,
    SocketRequestManager,
} from '@chatic/data';

import type { ReactNode } from 'react';

/**
 * Web 화면 계층에 노출되는 Repository 묶음입니다.
 * UI/Hook 계층은 RemoteDataSource나 SocketRequestManager 대신 이 객체만 사용합니다.
 */
export interface DataRepositories {
    auth: IAuthRepository;
    channel: IChannelRepository;
    chat: IChatRepository;
    join: IJoinRepository;
    user: IUserRepository;
    site: ISiteRepository;
    inviteCloud?: IInviteCloudRepository;
}

/**
 * WebDataProvider가 React context로 제공하는 값입니다.
 * dispatcher/requestManager/context는 전환 기간 동안 디버깅과 점진적 마이그레이션을 위해 함께 노출합니다.
 */
export interface DataProviderValue {
    repositories: DataRepositories;
    requestManager: SocketRequestManager;
    dispatcher: SocketDispatcher;
    context: MutableRepositoryContext;

    setRepositoryContext(context: RepositoryContext): void;
}

/**
 * WebDataProvider 외부 주입 계약입니다.
 * context는 테스트, 프리뷰, 외부 shell 환경에서 cid/sid/uid를 명시적으로 덮어쓸 때 사용합니다.
 */
export interface DataProviderProps {
    children: ReactNode;
    inviteCloudRepository?: IInviteCloudRepository;
    context?: RepositoryContext;
}
