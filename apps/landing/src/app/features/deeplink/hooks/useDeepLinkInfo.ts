import { useMemo } from 'react';

import type { DeepLinkInfo } from '../types';

export const useDeepLinkInfo = (): DeepLinkInfo => {
    return useMemo(() => {
        const path = window.location.pathname;
        const search = window.location.search;
        const fullPath = path + search;
        const deepLinkUrl = window.location.href;

        return { fullPath, deepLinkUrl };
    }, []);
};
