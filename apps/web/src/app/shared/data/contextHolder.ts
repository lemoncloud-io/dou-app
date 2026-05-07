import type { DataContext, DataContextProvider } from '@chatic/data';
import { DataContextHolder } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';
import { useEffect, useMemo, useState } from 'react';

export const useDataContextHolder = (
    injectedContext?: Partial<DataContext>
): { contextHolder: DataContextProvider; dataContext: DataContext } => {
    const cloudId = useWebSocketV2Store((state: { cloudId?: string | null }) => state.cloudId);
    const profileUid = useWebCoreStore(state => (state.profile as UserProfile$ | null | undefined)?.uid);
    const selectedPlaceId = cloudCore.getSelectedPlaceId() || undefined;

    // React 의존성 추적을 위한 순수 객체 (Snapshot)
    const dataContext = useMemo<DataContext>(() => {
        return {
            ...injectedContext,
            cid: injectedContext?.cid ?? cloudId ?? 'default',
            sid: injectedContext?.sid ?? selectedPlaceId,
            uid: injectedContext?.uid ?? profileUid ?? undefined,
        };
    }, [injectedContext, cloudId, profileUid, selectedPlaceId]);

    // 하위 계층에 주입되어 참조를 유지할 Mutable 객체
    const [contextHolder] = useState(() => new DataContextHolder(dataContext));

    // dataContext(상태)가 변경될 때마다 holder 내부 값을 업데이트
    useEffect(() => {
        contextHolder.setContext(dataContext);
    }, [contextHolder, dataContext]);

    return { contextHolder, dataContext };
};
