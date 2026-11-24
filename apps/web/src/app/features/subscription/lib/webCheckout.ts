import type { SubscriptionSummary } from './membershipStatus';

const WEB_PLATFORMS: readonly string[] = ['portone', 'stripe'];

export const isWebBilled = (platform: string | null | undefined): boolean =>
    !!platform && WEB_PLATFORMS.includes(platform);

export const webPlanPlatform = (platform: string | null | undefined): string | undefined =>
    isWebBilled(platform) ? (platform as string) : undefined;

export const canCheckoutOnWeb = (
    summary: Pick<SubscriptionSummary, 'hasLiveReceipt'>,
    platform: string | null | undefined
): boolean => !summary.hasLiveReceipt || isWebBilled(platform);

export const isHeldByWeb = (
    summary: Pick<SubscriptionSummary, 'hasLiveReceipt' | 'isAdminOverridden' | 'isEntitled'>,
    platform: string | null | undefined,
    status?: string | null
): boolean =>
    isWebBilled(platform) &&
    (summary.hasLiveReceipt || (!!summary.isAdminOverridden && summary.isEntitled) || status === 'pending');
