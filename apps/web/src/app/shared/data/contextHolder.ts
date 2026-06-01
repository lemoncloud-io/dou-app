import type { DataContext, DataContextProvider } from '@chatic/data';
import { DataContextHolder } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

export const useDataContextHolder = (
    injectedContext?: Partial<DataContext>
): { contextHolder: DataContextProvider; dataContext: DataContext } => {
    const cloudId = useWebSocketV2Store((state: { cloudId?: string | null }) => state.cloudId);
    const profileUid = useWebCoreStore(state => (state.profile as UserProfile$ | null | undefined)?.uid);
    const selectedPlaceId = useWebSocketV2Store(state => state.selectedPlaceId) || undefined;

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

    // Zustand store를 직접 subscribe하여 cloudId/placeId 변경 시 contextHolder를 즉시 동기적으로 업데이트
    // React render cycle(useLayoutEffect)을 기다리지 않으므로 async 함수 내에서
    // setCloudId() 직후 호출되는 cache read가 올바른 cid scope를 사용함
    useEffect(() => {
        return useWebSocketV2Store.subscribe(state => {
            const current = contextHolder.getContext();
            const nextCid = injectedContext?.cid ?? state.cloudId ?? cloudCore.getSelectedCloudId() ?? 'default';
            const nextSid = injectedContext?.sid ?? state.selectedPlaceId ?? undefined;
            if (current.cid !== nextCid || current.sid !== nextSid) {
                contextHolder.setContext({ ...current, cid: nextCid, sid: nextSid });
            }
        });
    }, [contextHolder, injectedContext]);

    return { contextHolder, dataContext };
};
