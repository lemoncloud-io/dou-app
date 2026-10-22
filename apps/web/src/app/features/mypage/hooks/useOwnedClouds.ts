import { useMemo } from 'react';

import { useCachedCloudNames } from '../../../hooks/useCachedCloudNames';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';

/**
 * The owned clouds of the relay catalog, each named the way home names it: a locally cached name
 * wins over the catalog's.
 *
 * The catalog re-reads on every mount, and the relay's list can still answer with the old name for a
 * moment after a rename. Closing the profile screen remounts the management screens straight into
 * that window, so a catalog-only name reads as if the rename had not happened. The rename writes the
 * new name into the local cloud cache first, and that is the name these screens show — the same
 * rule home's header and the cloud switcher already follow, so a cloud never reads one way there and
 * another here.
 */
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
