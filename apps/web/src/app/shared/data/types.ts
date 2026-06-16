import type { DataContext, DataRepositories } from '@chatic/data';

import type { ReactNode } from 'react';

/**
 * WebDataProvider가 React context로 제공하는 값입니다.
 * 화면 계층은 소켓/요청 관리자에 직접 접근하지 않고 Repository 묶음만 사용합니다.
 */
export interface DataProviderValue {
    repositories: DataRepositories;
    setDataContext(context: DataContext): void;
    socketClient: any;
}

/**
 * WebDataProvider 외부 주입 계약입니다.
 * context는 테스트, 프리뷰, 외부 shell 환경에서 cid/sid/uid를 명시적으로 덮어쓸 때 사용합니다.
 */
export interface DataProviderProps {
    children: ReactNode;
    context?: DataContext;
}
