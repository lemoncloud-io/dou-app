import { useCallback } from 'react';

import { useCachedCloudNames } from './useCachedCloudNames';
import { useCloudSessionCatalog } from './useCloudCatalog';

/**
 * A cloud's display name: the cached name, then the relay catalog's, then the id itself.
 *
 * The cache comes first for two reasons. An invited cloud is not in the catalog at all, so the cache
 * is its only name. And an owned cloud's cached name is the fresh one right after an edit
 * (`useCachedCloudNames`), which is the order the home switch sheet already applies.
 */
export const cloudDisplayName = (
    cloudId: string | undefined,
    cachedNames: Readonly<Record<string, string>>,
    catalog: ReadonlyArray<{ id?: string; name?: string }>
): string => {
    if (!cloudId) return '';
    return cachedNames[cloudId] || catalog.find(cloud => cloud.id === cloudId)?.name || cloudId;
};

/**
 * Names a cloud by id, for a screen that shows a cloud it does not list — an approval's scope, say.
 *
 * Not narrowed to the clouds this session can switch to: a record made earlier can name an invited
 * cloud this session no longer lists, and it should still read as that cloud's name.
 */
export const useCloudName = (): ((cloudId?: string) => string) => {
    const { clouds } = useCloudSessionCatalog();
    const cachedNames = useCachedCloudNames();
    return useCallback((cloudId?: string) => cloudDisplayName(cloudId, cachedNames, clouds), [cachedNames, clouds]);
};
