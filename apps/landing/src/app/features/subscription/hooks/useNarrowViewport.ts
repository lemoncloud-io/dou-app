import { useSyncExternalStore } from 'react';

/** Below Tailwind's `md` breakpoint the subscription pages show the desktop-only notice instead. */
export const NARROW_QUERY = '(max-width: 767px)';

const subscribe = (onChange: () => void) => {
    const media = window.matchMedia(NARROW_QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
};

const read = () => window.matchMedia(NARROW_QUERY).matches;

/** Whether the viewport is phone-width, tracking resizes and rotation. */
export const useNarrowViewport = (): boolean => useSyncExternalStore(subscribe, read);
