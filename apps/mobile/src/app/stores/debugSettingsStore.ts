import Config from 'react-native-config';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PreferenceKey } from '@chatic/app-messages';

import { storageAdapter } from './storageAdapter';

export type MockServiceMode = 'off' | 'local' | 'fixture';

interface DebugSettingsState {
    webviewBaseUrlOverride: string | null;
    mockServiceMode: MockServiceMode;
    mockServiceBaseUrl: string | null;
    overlayBackdropOpacity: number;
    overlayContentOpacity: number;
    /** Runtime debug unlock propagated from the web 10-tap gesture (works in PROD builds). */
    debugModeEnabled: boolean;
    /**
     * Holds log uploads — keeps the queue accumulating instead of draining it, so MonitoringScreen
     * can read it.
     * A separate lever from device opt-out (declining collection): hold keeps the queue, opt-out discards it.
     */
    logUploadHold: boolean;
    /** The local root the custom web zip was extracted to (persisted — the sole source of truth for restoring the server on restart) */
    customZipLocalRoot: string | null;
    /**
     * The URL of the currently running local server (runtime only, excluded from persist).
     * If persisted, the WebView would load localhost before the server comes up on restart,
     * producing a blank screen — must only be set after the server start succeeds.
     */
    customZipServerUrl: string | null;
    setWebviewBaseUrlOverride: (url: string | null) => void;
    setMockServiceMode: (mode: MockServiceMode) => void;
    setMockServiceBaseUrl: (url: string | null) => void;
    setOverlayBackdropOpacity: (opacity: number) => void;
    setOverlayContentOpacity: (opacity: number) => void;
    setDebugModeEnabled: (enabled: boolean) => void;
    setLogUploadHold: (hold: boolean) => void;
    setCustomZipLocalRoot: (root: string | null) => void;
    setCustomZipServerUrl: (url: string | null) => void;
    resetDebugSettings: () => void;
    getResolvedWebviewBaseUrl: () => string;
}

export const defaultDebugSettings = {
    webviewBaseUrlOverride: null,
    mockServiceMode: 'off' as MockServiceMode,
    mockServiceBaseUrl: null,
    overlayBackdropOpacity: 0.35,
    overlayContentOpacity: 1,
    debugModeEnabled: false,
    logUploadHold: false,
    customZipLocalRoot: null,
    customZipServerUrl: null,
};

const normalizeUrl = (url: string | null): string | null => {
    const trimmed = url?.trim();
    if (!trimmed) return null;
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

export const getDefaultWebviewBaseUrl = () => normalizeUrl(Config.VITE_WEBVIEW_BASE_URL ?? '') ?? '';

const clampOverlayOpacity = (opacity: number) => Math.min(0.85, Math.max(0, opacity));
const clampOverlayContentOpacity = (opacity: number) => Math.min(1, Math.max(0.35, opacity));

export const useDebugSettingsStore = create<DebugSettingsState>()(
    persist(
        (set, get) => ({
            ...defaultDebugSettings,
            setWebviewBaseUrlOverride: url => set({ webviewBaseUrlOverride: normalizeUrl(url) }),
            setMockServiceMode: mode => set({ mockServiceMode: mode }),
            setMockServiceBaseUrl: url => set({ mockServiceBaseUrl: normalizeUrl(url) }),
            setOverlayBackdropOpacity: opacity => set({ overlayBackdropOpacity: clampOverlayOpacity(opacity) }),
            setOverlayContentOpacity: opacity => set({ overlayContentOpacity: clampOverlayContentOpacity(opacity) }),
            setDebugModeEnabled: enabled => set({ debugModeEnabled: enabled }),
            setLogUploadHold: hold => set({ logUploadHold: hold }),
            setCustomZipLocalRoot: root => set({ customZipLocalRoot: root }),
            setCustomZipServerUrl: url => set({ customZipServerUrl: normalizeUrl(url) }),
            resetDebugSettings: () => set(defaultDebugSettings),
            getResolvedWebviewBaseUrl: () =>
                get().customZipServerUrl ?? get().webviewBaseUrlOverride ?? getDefaultWebviewBaseUrl(),
        }),
        {
            name: 'debugSettings' as PreferenceKey,
            storage: storageAdapter,
            // customZipServerUrl is runtime-only — excluded from persist (prevents loading localhost
            // before the server starts on restart).
            // Because this is a rest-destructure, a field rename surfaces as a compile error
            // (a string-key filter would silently leak through instead).
            // Omitting the excluded key requires destructuring it by name — the binding uses a `_`
            // prefix to allow it to be unused.
            partialize: ({ customZipServerUrl: _customZipServerUrl, ...rest }) => rest,
        }
    )
);
