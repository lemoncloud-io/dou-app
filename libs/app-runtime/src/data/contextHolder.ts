import type { DataContext, DataContextProvider } from '@chatic/data';
import { DataContextHolder } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { useLayoutEffect, useState } from 'react';

export const useDataContextHolder = (
    dataContext: DataContext
): { contextHolder: DataContextProvider; dataContext: DataContext } => {
    // 하위 계층에 주입되어 참조를 유지할 Mutable 객체
    const [contextHolder] = useState(() => new DataContextHolder(dataContext));

    // dataContext(상태)가 변경될 때마다 holder 내부 값을 업데이트
    // useLayoutEffect를 사용하여 하위 컴포넌트의 useEffect(쿼리)보다 먼저 context를 동기화
    useLayoutEffect(() => {
        const prev = contextHolder.getContext();
        if (prev.cid !== dataContext.cid || prev.sid !== dataContext.sid || prev.uid !== dataContext.uid) {
            logger.warn(
                'CACHE',
                `[DataContext] scope changed: cid=${prev.cid}→${dataContext.cid}, sid=${prev.sid}→${dataContext.sid}, uid=${prev.uid}→${dataContext.uid}`
            );
        }
        contextHolder.setContext(dataContext);
    }, [contextHolder, dataContext]);

    return { contextHolder, dataContext };
};
