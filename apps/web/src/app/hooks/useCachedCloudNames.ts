import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * Observes the local cloud cache and returns a map of `cloudId → cached name`.
 *
 * The relay catalog (`useCloudSessionCatalog`) is the list source for owned/subscription clouds, but
 * its name can lag a just-applied edit: `cloud.update` (and `cloud.get`) write the fresh name into
 * the local cloud cache first — see `CloudRepositoryV2`. Callers overlay this map on top of the
 * catalog so the cached name wins, keeping the displayed cloud name in sync immediately after an
 * edit — without waiting for a relay refetch.
 */
export const useCachedCloudNames = (): Record<string, string> => {
    const { cloud } = useRuntimeRepositories();
    const [names, setNames] = useState<Record<string, string>>({});

    useEffect(() => {
        return cloud.observeList(result => {
            const next: Record<string, string> = {};
            for (const cached of result?.list ?? []) {
                if (cached.id && cached.name) next[cached.id] = cached.name;
            }
            setNames(next);
        });
    }, [cloud]);

    return names;
};
