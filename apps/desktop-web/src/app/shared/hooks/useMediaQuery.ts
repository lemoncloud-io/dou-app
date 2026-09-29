import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a media query matches, kept current as it changes (a mouse plugged into a
 * tablet, the OS switching on reduced motion). Reading `matchMedia` once at import
 * froze the answer for the life of the window.
 */
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
