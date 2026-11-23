import { type CloudManageBanner, deriveCloudManageBanner } from '../lib';
import { usePlanCatalog } from './usePlanCatalog';

export interface CloudManageScene {
    isLoading: boolean;
    hasSubscription: boolean;
    banner: CloudManageBanner | undefined;
}

export const useCloudManageScene = (): CloudManageScene => {
    const { summary, isLoading } = usePlanCatalog();
    const hasPendingChange = summary.isEntitled && !!summary.pendingProductId;

    return {
        isLoading,
        hasSubscription: summary.state !== 'none',
        banner: deriveCloudManageBanner(summary.state, hasPendingChange),
    };
};
