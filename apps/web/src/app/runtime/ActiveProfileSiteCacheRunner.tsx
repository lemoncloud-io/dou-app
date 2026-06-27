import { useActiveProfileSiteCache } from './useActiveProfileSiteCache';

/**
 * Mounts the active-profile site cache. Renders nothing; placed once under AppRuntime beside
 * BackgroundSyncRunner so the active site is cached across all routes for the runtime lifetime.
 */
export const ActiveProfileSiteCacheRunner = (): null => {
    useActiveProfileSiteCache();
    return null;
};
