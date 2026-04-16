/**
 * Deep Link Store
 *
 * Manages pending deep link URLs for WebView navigation
 */

import { create } from 'zustand';

import type { DeepLinkSource, InviteCloudInfo, InviteSiteInfo, ServiceEndpoints } from '@chatic/deeplinks';

interface DeepLinkState {
    pendingUrl: string | null;
    source: DeepLinkSource | null;
    pendingEnvs: ServiceEndpoints | null;
    pendingSite: InviteSiteInfo | null;
    pendingCloud: InviteCloudInfo | null;
    isWebViewReady: boolean;
    deepLinkError: boolean;
    deepLinkErrorReason: string | null;
    setPendingUrl: (
        url: string,
        source: DeepLinkSource,
        envs?: ServiceEndpoints,
        site?: InviteSiteInfo,
        cloud?: InviteCloudInfo
    ) => void;
    clearPendingUrl: () => void;
    setWebViewReady: (ready: boolean) => void;
    setDeepLinkError: (error: boolean, reason?: string) => void;
}

export const useDeepLinkStore = create<DeepLinkState>(set => ({
    pendingUrl: null,
    source: null,
    pendingEnvs: null,
    pendingSite: null,
    pendingCloud: null,
    isWebViewReady: false,
    deepLinkError: false,
    deepLinkErrorReason: null,
    setPendingUrl: (url, source, envs, site, cloud) =>
        set({
            pendingUrl: url,
            source,
            pendingEnvs: envs ?? null,
            pendingSite: site ?? null,
            pendingCloud: cloud ?? null,
            deepLinkError: false,
            deepLinkErrorReason: null,
        }),
    clearPendingUrl: () =>
        set({ pendingUrl: null, source: null, pendingEnvs: null, pendingSite: null, pendingCloud: null }),
    setWebViewReady: ready => set({ isWebViewReady: ready }),
    setDeepLinkError: (error, reason) => set({ deepLinkError: error, deepLinkErrorReason: reason ?? null }),
}));
