/**
 * Deep Linking Module
 *
 * Handles native deep linking for hybrid WebView apps
 *
 * Usage:
 * ```typescript
 * import { getDeepLinkManager } from '@chatic/deeplinks';
 *
 * const manager = getDeepLinkManager();
 * manager.initialize({
 *     handleDeepLink: (url, source) => {
 *         // Store URL in Zustand store for WebView navigation
 *         setPendingUrl(url, source);
 *     },
 * });
 * ```
 */

export { DeepLinkManager, getDeepLinkManager, resetDeepLinkManager } from './manager';
export {
    clearDeferredLink,
    getDeferredLink,
    handleDeferredDeepLink,
    markDeferredLinkProcessed,
    storeDeferredLink,
} from './deferred';
export { extractCampaignParams, extractShortCode, isShortUrl, isValidDeepLink } from './parser';
export { convertDeepLinkToFrontendUrl, convertShortUrlWithEnvs, needsConversion } from './urlConverter';
export type { ConvertedUrlResult, ServiceEndpoints } from './urlConverter';
export { generateFingerprint, getFingerprintComponents } from './fingerprint';
export { retrieveDeferredLinkFromFirestore, storeDeferredLinkToFirestore } from './firestoreDeferred';
export { createInviteLink, getInviteLink, checkInviteLinkExists, deleteInviteLink } from './inviteLink';
// Export only public constants and type guards
export {
    CUSTOM_SCHEMES,
    DEEP_LINK_DOMAINS,
    DEEPLINK_DOMAIN,
    FRONTEND_DOMAIN,
    VALID_DOMAINS,
    VALID_SCHEMES,
    hashFingerprintComponents,
    isCustomScheme,
    isDeepLinkDomain,
    isValidDomain,
    isValidScheme,
} from './constants';
export type { DeepLinkConfig, DeepLinkSource, DeferredLinkData, WebViewHandler } from './types';
export type { FingerprintComponents } from './fingerprint';
export type { DeferredLinkDocument } from './firestoreDeferred';
export type { InviteLinkDocument, InviteLink } from './inviteLink';
