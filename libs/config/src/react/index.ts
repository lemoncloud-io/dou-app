import { useCallback, useSyncExternalStore } from 'react';

import { config } from '..';

export const useConfigValue = <T>(key: string): T | undefined => {
    const subscribe = useCallback((onChange: () => void) => config.subscribe([key], onChange), [key]);
    const getSnapshot = useCallback(() => config.get<T>(key), [key]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
