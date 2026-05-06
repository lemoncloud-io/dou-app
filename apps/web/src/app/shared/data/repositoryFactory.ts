import { useEffect, useMemo, useState } from 'react';

import type {
    DataRepositories,
    IEventBus,
    ISocketRequestManager,
    LocalDataSources,
    RemoteDataSources,
} from '@chatic/data';
import { createRepositories } from '@chatic/data';
import {
    type DomainEventMap,
    MutableRepositoryContext,
    type RepositoryContext,
    SocketRequestManager,
} from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

/**
 * Repository 인스턴스를 재생성하지 않고 context 값만 갱신하기 위한 mutable holder를 만듭니다.
 *
 * 우선순위:
 * 1. Provider prop으로 명시 주입된 context
 * 2. web-core/socket store에서 읽은 현재 세션 값
 * 3. cloud 미선택 시 default cloud
 *
 * Repository는 holder를 참조하므로 cid/sid/uid 변경이 getContext 호출 시점에 반영됩니다.
 */
export const useRepositoryContextHolder = (injectedContext?: RepositoryContext): MutableRepositoryContext => {
    const cloudId = useWebSocketV2Store((state: { cloudId?: string | null }) => state.cloudId);
    const profileUid = useWebCoreStore(state => (state.profile as UserProfile$ | null | undefined)?.uid);
    // place 선택 값은 cloudCore storage에 존재한다.
    // 같은 탭 storage 변경은 이벤트가 발생하지 않으므로 provider 렌더링 시점마다 최신 값을 다시 읽는다.
    const selectedPlaceId = cloudCore.getSelectedPlaceId() || undefined;

    const repositoryContext = useMemo<RepositoryContext>(() => {
        return {
            ...injectedContext,
            cid: injectedContext?.cid ?? cloudId ?? 'default',
            sid: injectedContext?.sid ?? selectedPlaceId,
            uid: injectedContext?.uid ?? profileUid ?? undefined,
        };
    }, [injectedContext, cloudId, profileUid, selectedPlaceId]);

    const [context] = useState(() => new MutableRepositoryContext(repositoryContext));

    useEffect(() => {
        context.setContext(repositoryContext);
    }, [context, repositoryContext]);

    return context;
};

/**
 * Repository 계층에 필요한 생성과 context 주입을 한 곳에서 처리합니다.
 * DataProvider는 event bus와 socket client만 넘기고, requestManager/dataSource/repository 조립은 이 factory에 위임합니다.
 */
export const useRepositoryFactory = ({
    remoteDataSources,
    localDataSources,
    context,
    domainEventBus,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSources;
    context: MutableRepositoryContext;
    domainEventBus: IEventBus<DomainEventMap>;
}): { repositories: DataRepositories } => {
    const requestManager: ISocketRequestManager = useMemo(
        () => new SocketRequestManager(domainEventBus),
        [domainEventBus]
    );

    const repositories = useMemo(
        () => createRepositories({ context, remoteDataSources, localDataSources, domainEventBus, requestManager }),
        [context, remoteDataSources, localDataSources, domainEventBus, requestManager]
    );

    return { repositories };
};
