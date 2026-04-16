/**
 * Deep Linking Types
 *
 * Type definitions for native deep linking implementation
 */

import type { ServiceEndpoints, InviteSiteInfo, InviteCloudInfo } from './urlConverter';

export type DeepLinkSource = 'cold_start' | 'warm_start' | 'deferred';

export interface DeepLinkConfig {
    /** Deep link domain (e.g., app.chatic.io) */
    deepLinkDomain: string;
    /** Frontend domain for WebView (e.g., dou.chatic.io) */
    frontendDomain: string;
    /** Custom URL schemes (e.g., ['chatic']) */
    customSchemes: string[];
}

export interface WebViewHandler {
    /**
     * Handle a deep link URL after processing
     * @param url - The processed frontend URL (after domain conversion)
     * @param source - The source of the deep link
     * @param envs - Optional service endpoints to inject into WebView
     */
    handleDeepLink: (
        url: string,
        source: DeepLinkSource,
        envs?: ServiceEndpoints,
        site?: InviteSiteInfo,
        cloud?: InviteCloudInfo
    ) => void | Promise<void>;
    /**
     * Handle deep link processing error
     * Called when short URL expansion (Firestore lookup) fails
     */
    handleError?: (reason: string) => void;
}

export interface DeferredLinkData {
    url: string;
    timestamp: number;
}
