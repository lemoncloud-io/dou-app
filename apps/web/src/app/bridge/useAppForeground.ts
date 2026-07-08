import { useAppVisibility } from './useAppVisibility';

/**
 * Unified "app returned to foreground" signal — a filtered view of useAppVisibility, which
 * owns the native/web source merging and the dedup window. Consumers react to foreground
 * (list refresh, chat catch-up, overlay dismiss) without knowing which source fired.
 */
export const useAppForeground = (handler: () => void): void => {
    useAppVisibility(isForeground => {
        if (isForeground) handler();
    });
};
