import type { DeepLinkInfo } from '../types';

/**
 * Hook to get current deep link info from URL.
 * URL doesn't change during component lifecycle, so no memoization needed.
 */
export const useDeepLinkInfo = (): DeepLinkInfo => ({
    fullPath: window.location.pathname + window.location.search,
    deepLinkUrl: window.location.href,
});
