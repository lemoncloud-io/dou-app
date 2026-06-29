import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import { useEffect } from 'react';

/**
 * Mounts the active-profile site cache. Renders nothing; placed once under AppRuntime beside
 * BackgroundSyncRunner so the active site is cached across all routes for the runtime lifetime.
 */
export const ActiveProfileSiteCacheRunner = (): null => {
    const repos = useRuntimeRepositories();
    const site = useSessionIdentity().activeProfile?.$site;

    useEffect(() => {
        // No site (logged out / profile not loaded yet): leave the cache untouched.
        if (!site) return;
        // Best-effort local write — a failure must not surface to the UI.
        void repos.place.cacheWrite(site).catch(() => {
            /* best-effort */
        });
    }, [repos.place, site]);

    return null;
};
