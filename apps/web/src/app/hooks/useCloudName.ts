import { useCallback } from 'react';

import { useCachedCloudNames } from './useCachedCloudNames';
import { useCloudSessionCatalog } from './useCloudCatalog';

export const cloudDisplayName = (
    cloudId: string | undefined,
    cachedNames: Readonly<Record<string, string>>,
    catalog: ReadonlyArray<{ id?: string; name?: string }>
): string => {
    if (!cloudId) return '';
    return cachedNames[cloudId] || catalog.find(cloud => cloud.id === cloudId)?.name || cloudId;
};

export const useCloudName = (): ((cloudId?: string) => string) => {
    const { clouds } = useCloudSessionCatalog();
    const cachedNames = useCachedCloudNames();
    return useCallback((cloudId?: string) => cloudDisplayName(cloudId, cachedNames, clouds), [cachedNames, clouds]);
};
