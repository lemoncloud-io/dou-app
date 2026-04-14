/**
 * Deep Link Store
 *
 * Manages pending deep link URLs for WebView navigation
 */

import { create } from 'zustand';

import type { DeepLinkSource, ServiceEndpoints, InviteSiteInfo } from '@chatic/deeplinks';

interface DeepLinkState {
    pendingUrl: string | null;
    source: DeepLinkSource | null;
    pendingEnvs: ServiceEndpoints | null;
    pendingSite: InviteSiteInfo | null;
    isWebViewReady: boolean;
    deepLinkError: boolean;
    deepLinkErrorReason: string | null;
    setPendingUrl: (url: string, source: DeepLinkSource, envs?: ServiceEndpoints, site?: InviteSiteInfo) => void;
    clearPendingUrl: () => void;
    setWebViewReady: (ready: boolean) => void;
    setDeepLinkError: (error: boolean, reason?: string) => void;
}

export const useDeepLinkStore = create<DeepLinkState>(set => ({
    pendingUrl: null,
    source: null,
    pendingEnvs: null,
    pendingSite: null,
    isWebViewReady: false,
    deepLinkError: false,
    deepLinkErrorReason: null,
    setPendingUrl: (url, source, envs, site) =>
        set({
            pendingUrl: url,
            source,
            pendingEnvs: envs ?? null,
            pendingSite: site ?? null,
            deepLinkError: false,
            deepLinkErrorReason: null,
        }),
    clearPendingUrl: () => set({ pendingUrl: null, source: null, pendingEnvs: null, pendingSite: null }),
    setWebViewReady: ready => set({ isWebViewReady: ready }),
    setDeepLinkError: (error, reason) => set({ deepLinkError: error, deepLinkErrorReason: reason ?? null }),
}));
