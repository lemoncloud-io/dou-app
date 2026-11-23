import { useMemo } from 'react';

import { useCachedCloudNames } from '../../../hooks/useCachedCloudNames';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';

export const useOwnedClouds = (): ReturnType<typeof useCloudSessionCatalog> => {
    const catalog = useCloudSessionCatalog();
    const cachedNames = useCachedCloudNames();
    const clouds = useMemo(
        () =>
            catalog.clouds.map(cloud => {
                const cachedName = cloud.id ? cachedNames[cloud.id] : undefined;
                return cachedName && cachedName !== cloud.name ? { ...cloud, name: cachedName } : cloud;
            }),
        [catalog.clouds, cachedNames]
    );
    return { ...catalog, clouds };
};
