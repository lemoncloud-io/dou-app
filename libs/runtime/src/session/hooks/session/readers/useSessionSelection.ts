import { useGlobalSession } from './useGlobalSession';

export const useSessionSelection = () => {
    const { cloud, activeServer } = useGlobalSession();

    return {
        selectedCloudId: cloud.cloudId ?? 'default',
        selectedSiteId: activeServer.siteId ?? null,
    };
};
