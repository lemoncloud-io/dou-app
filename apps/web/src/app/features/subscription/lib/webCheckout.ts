import type { SubscriptionSummary } from './membershipStatus';

/**
 * The website's payment providers. The relay writes them into `membership.platform` beside the two
 * stores, but the client types still list only the stores, so the platform is read as a string.
 */
const WEB_PLATFORMS: readonly string[] = ['portone', 'stripe'];

/** Whether the membership is billed by the website's checkout rather than an app store. */
export const isWebBilled = (platform: string | null | undefined): boolean =>
    !!platform && WEB_PLATFORMS.includes(platform);

/**
 * Whether a session outside the app may send the reader to the website's checkout: anything but a
 * running store subscription. The relay refuses a web purchase while a store subscription is live, and
 * a store's subscription can only be changed on that store, so for one of those the app keeps saying
 * so instead of handing over to a page that cannot act on it. No subscription, a lapsed one, an admin
 * grant without a receipt, or one the website bills all go to the website.
 */
export const canCheckoutOnWeb = (
    summary: Pick<SubscriptionSummary, 'hasLiveReceipt'>,
    platform: string | null | undefined
): boolean => !summary.hasLiveReceipt || isWebBilled(platform);

/** Whether the website is billing this membership right now — a subscription no store may sell over. */
export const isHeldByWeb = (
    summary: Pick<SubscriptionSummary, 'hasLiveReceipt'>,
    platform: string | null | undefined
): boolean => summary.hasLiveReceipt && isWebBilled(platform);
