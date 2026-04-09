import type React from 'react';
import { useEffect } from 'react';
import { useGlobalCacheSync } from '../data';

export const GlobalSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    useGlobalCacheSync();

    // 다중 탭 동기화를 위한 브로드캐스트 수신부
    useEffect(() => {
        const bc = new BroadcastChannel('app-db-sync');
        bc.onmessage = event => {
            window.dispatchEvent(new CustomEvent('local-db-updated', { detail: event.data }));
        };

        return () => bc.close();
    }, []);

    return <>{children}</>;
};
