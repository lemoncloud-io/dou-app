import type { DeepLinkInfo } from '../types';

export const useDeepLinkInfo = (): DeepLinkInfo => ({
    fullPath: window.location.pathname + window.location.search,
    deepLinkUrl: window.location.href,
});
