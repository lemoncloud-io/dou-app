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
     * 로그 업로드 보류 — 큐를 비우지 말고 쌓아두게 만들어 MonitoringScreen이 읽을 수 있게 한다.
     * 기기 opt-out(수집 거부)과는 다른 레버다: 보류는 큐를 유지하고, opt-out은 버린다.
     */
    logUploadHold: boolean;
    /** 커스텀 web zip이 압축해제된 로컬 루트 (persist — 재시작 시 서버 복원의 유일한 진실원) */
    customZipLocalRoot: string | null;
    /**
     * 기동 중인 로컬 서버의 URL (runtime 전용, persist 제외).
     * persist하면 재시작 시 서버가 뜨기 전에 WebView가 localhost를 로딩해 흰 화면이 된다 —
     * 반드시 서버 start 성공 후에만 set.
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
            // customZipServerUrl은 runtime 전용 — persist에서 제외 (재시작 시 서버 기동 전 localhost 로딩 방지).
            // rest-destructure라 필드명 변경 시 컴파일 에러로 드러남 (문자열 키 필터는 조용히 새어나감).
            // 제외 대상 키를 omit하려면 이름으로 destructure 필요 — 바인딩은 `_` 접두로 unused 허용.
            partialize: ({ customZipServerUrl: _customZipServerUrl, ...rest }) => rest,
        }
    )
);
