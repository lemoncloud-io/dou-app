import type { DataContext, DataContextProvider } from '@chatic/data';
import { DataContextHolder } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

export const useDataContextHolder = (
    injectedContext?: Partial<DataContext>
): { contextHolder: DataContextProvider; dataContext: DataContext } => {
    const { selectedCloudId: cloudId, selectedPlaceId: rawPlaceId } = useWebCoreStore();
    const profileUid = useWebCoreStore(state => (state.profile as UserProfile$ | null | undefined)?.uid);
    const selectedPlaceId = rawPlaceId || undefined;

    // React 의존성 추적을 위한 순수 객체 (Snapshot)
    const dataContext = useMemo<DataContext>(() => {
        return {
            ...injectedContext,
            cid: injectedContext?.cid ?? cloudId ?? cloudCore.getSelectedCloudId() ?? 'default',
            sid: injectedContext?.sid ?? selectedPlaceId,
            uid: injectedContext?.uid ?? profileUid ?? undefined,
        };
    }, [injectedContext, cloudId, profileUid, selectedPlaceId]);

    // 하위 계층에 주입되어 참조를 유지할 Mutable 객체
    const [contextHolder] = useState(() => new DataContextHolder(dataContext));

    // dataContext(상태)가 변경될 때마다 holder 내부 값을 업데이트
    // useLayoutEffect를 사용하여 하위 컴포넌트의 useEffect(쿼리)보다 먼저 context를 동기화
    useLayoutEffect(() => {
        const prev = contextHolder.getContext();
        if (prev.cid !== dataContext.cid || prev.uid !== dataContext.uid) {
            logger.warn(
                'CACHE',
                `[DataContext] scope changed: cid=${prev.cid}→${dataContext.cid}, uid=${prev.uid}→${dataContext.uid}`
            );
        }
        contextHolder.setContext(dataContext);
    }, [contextHolder, dataContext]);

    useEffect(() => {
        return useWebCoreStore.subscribe(state => {
            const current = contextHolder.getContext();
            const nextCid = injectedContext?.cid ?? state.selectedCloudId ?? 'default';
            const nextSid = injectedContext?.sid ?? state.selectedPlaceId ?? undefined;
            if (current.cid !== nextCid || current.sid !== nextSid) {
                contextHolder.setContext({ ...current, cid: nextCid, sid: nextSid });
            }
        });
    }, [contextHolder, injectedContext]);

    return { contextHolder, dataContext };
};
