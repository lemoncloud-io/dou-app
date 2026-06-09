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
    setWebviewBaseUrlOverride: (url: string | null) => void;
    setMockServiceMode: (mode: MockServiceMode) => void;
    setMockServiceBaseUrl: (url: string | null) => void;
    setOverlayBackdropOpacity: (opacity: number) => void;
    setOverlayContentOpacity: (opacity: number) => void;
    resetDebugSettings: () => void;
    getResolvedWebviewBaseUrl: () => string;
}

export const defaultDebugSettings = {
    webviewBaseUrlOverride: null,
    mockServiceMode: 'off' as MockServiceMode,
    mockServiceBaseUrl: null,
    overlayBackdropOpacity: 0.35,
    overlayContentOpacity: 1,
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
            resetDebugSettings: () => set(defaultDebugSettings),
            getResolvedWebviewBaseUrl: () => get().webviewBaseUrlOverride ?? getDefaultWebviewBaseUrl(),
        }),
        {
            name: 'debugSettings' as PreferenceKey,
            storage: storageAdapter,
        }
    )
);
