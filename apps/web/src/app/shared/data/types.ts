import type {
    IAuthRepository,
    IChannelRepository,
    IChatRepository,
    IInviteCloudRepository,
    IJoinRepository,
    ISiteRepository,
    IUserRepository,
    RepositoryContext,
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
 * 화면 계층은 소켓/요청 관리자에 직접 접근하지 않고 Repository 묶음만 사용합니다.
 */
export interface DataProviderValue {
    repositories: DataRepositories;
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
