/**
 * Deep Link Store
 *
 * Manages pending deep link URLs for WebView navigation
 */

import { create } from 'zustand';

import type { DeepLinkSource } from '@chatic/deeplinks';

interface DeepLinkState {
    /** Pending deep link URL to be loaded in WebView */
    pendingUrl: string | null;
    /** Source of the deep link */
    source: DeepLinkSource | null;
    /** Whether WebView has been initialized */
    isWebViewReady: boolean;
    /** Set pending deep link URL */
    setPendingUrl: (url: string, source: DeepLinkSource) => void;
    /** Clear pending deep link URL */
    clearPendingUrl: () => void;
    /** Mark WebView as ready */
    setWebViewReady: (ready: boolean) => void;
}

export const useDeepLinkStore = create<DeepLinkState>(set => ({
    pendingUrl: null,
    source: null,
    isWebViewReady: false,
    setPendingUrl: (url, source) => set({ pendingUrl: url, source }),
    clearPendingUrl: () => set({ pendingUrl: null, source: null }),
    setWebViewReady: ready => set({ isWebViewReady: ready }),
}));
