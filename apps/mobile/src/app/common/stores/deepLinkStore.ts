/**
 * Deep Link Store
 *
 * Manages pending deep link URLs for WebView navigation
 */

import { create } from 'zustand';

import type { DeepLinkSource, ServiceEndpoints } from '@chatic/deeplinks';

interface DeepLinkState {
    /** Pending deep link URL to be loaded in WebView */
    pendingUrl: string | null;
    /** Source of the deep link */
    source: DeepLinkSource | null;
    /** Service endpoints to inject into WebView */
    pendingEnvs: ServiceEndpoints | null;
    /** Whether WebView has been initialized */
    isWebViewReady: boolean;
    /** Whether deep link processing failed */
    deepLinkError: boolean;
    /** Deep link error reason */
    deepLinkErrorReason: string | null;
    /** Set pending deep link URL with optional envs */
    setPendingUrl: (url: string, source: DeepLinkSource, envs?: ServiceEndpoints) => void;
    /** Clear pending deep link URL */
    clearPendingUrl: () => void;
    /** Mark WebView as ready */
    setWebViewReady: (ready: boolean) => void;
    /** Set deep link error state */
    setDeepLinkError: (error: boolean, reason?: string) => void;
}

export const useDeepLinkStore = create<DeepLinkState>(set => ({
    pendingUrl: null,
    source: null,
    pendingEnvs: null,
    isWebViewReady: false,
    deepLinkError: false,
    deepLinkErrorReason: null,
    setPendingUrl: (url, source, envs) =>
        set({ pendingUrl: url, source, pendingEnvs: envs ?? null, deepLinkError: false, deepLinkErrorReason: null }),
    clearPendingUrl: () => set({ pendingUrl: null, source: null, pendingEnvs: null }),
    setWebViewReady: ready => set({ isWebViewReady: ready }),
    setDeepLinkError: (error, reason) => set({ deepLinkError: error, deepLinkErrorReason: reason ?? null }),
}));
