import { create } from 'zustand';

export interface DebugWebViewState {
    currentUrl: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    lastLoadStartUrl: string;
    lastLoadEndUrl: string;
    lastError: string | null;
}

interface DebugRuntimeState {
    webViewReloadToken: number;
    webView: DebugWebViewState;
    requestWebViewReload: () => void;
    updateWebViewState: (next: Partial<DebugWebViewState>) => void;
    resetWebViewError: () => void;
}

const initialWebViewState: DebugWebViewState = {
    currentUrl: '',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    lastLoadStartUrl: '',
    lastLoadEndUrl: '',
    lastError: null,
};

export const useDebugRuntimeStore = create<DebugRuntimeState>()(set => ({
    webViewReloadToken: 0,
    webView: initialWebViewState,
    requestWebViewReload: () => set(state => ({ webViewReloadToken: state.webViewReloadToken + 1 })),
    updateWebViewState: next => set(state => ({ webView: { ...state.webView, ...next } })),
    resetWebViewError: () => set(state => ({ webView: { ...state.webView, lastError: null } })),
}));
