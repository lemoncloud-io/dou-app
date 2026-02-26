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
export { convertDeepLinkToFrontendUrl, convertShortUrlToFrontendUrl, needsConversion } from './urlConverter';
export { generateFingerprint, getFingerprintComponents } from './fingerprint';
export {
    cleanupExpiredLinks,
    retrieveDeferredLinkFromFirestore,
    storeDeferredLinkToFirestore,
} from './firestoreDeferred';
export type { DeepLinkConfig, DeepLinkSource, DeferredLinkData, WebViewHandler } from './types';
export type { FingerprintComponents } from './fingerprint';
export type { DeferredLinkDocument } from './firestoreDeferred';
