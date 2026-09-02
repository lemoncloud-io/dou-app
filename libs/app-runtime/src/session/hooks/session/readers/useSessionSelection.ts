import { useGlobalSession } from './useGlobalSession';

/**
 * Returns the currently selected cloud and site identifiers derived from session context.
 */
export const useSessionSelection = () => {
    const { cloud, activeServer } = useGlobalSession();

    return {
        selectedCloudId: cloud.cloudId ?? 'default',
        selectedSiteId: activeServer.siteId ?? null,
    };
};
