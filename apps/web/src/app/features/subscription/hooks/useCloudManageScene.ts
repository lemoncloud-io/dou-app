import { type CloudManageBanner, deriveCloudManageBanner } from '../lib';
import { usePlanCatalog } from './usePlanCatalog';

export interface CloudManageScene {
    isLoading: boolean;
    /** The account has a membership of any kind — lapsed or blocked included. */
    hasSubscription: boolean;
    /** The one banner the screen leads with, or none. */
    banner: CloudManageBanner | undefined;
}

/**
 * What cloud management needs to know about the subscription, and nothing more.
 *
 * The screen branches on two facts — is there a subscription at all, and is something standing
 * between the user and their clouds — so this is the seam it reads instead of `usePlanCatalog`:
 * one hook, one derivation, shared with the banner component so the add-cloud button and the
 * banner cannot disagree about which state the screen is in.
 */
export const useCloudManageScene = (): CloudManageScene => {
    const { summary, isLoading } = usePlanCatalog();
    const hasPendingChange = summary.isEntitled && !!summary.pendingProductId;

    return {
        isLoading,
        hasSubscription: summary.state !== 'none',
        banner: deriveCloudManageBanner(summary.state, hasPendingChange),
    };
};
