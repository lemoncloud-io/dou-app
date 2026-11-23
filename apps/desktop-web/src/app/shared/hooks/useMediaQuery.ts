import { useCallback, useSyncExternalStore } from 'react';

export const useMediaQuery = (query: string): boolean => {
    const subscribe = useCallback(
        (onChange: () => void) => {
            const list = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined;
            list?.addEventListener('change', onChange);
            return () => list?.removeEventListener('change', onChange);
        },
        [query]
    );
    return useSyncExternalStore(
        subscribe,
        () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true,
        () => false
    );
};
