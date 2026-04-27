import { create } from 'zustand';

/**
 * sessionStorage key for splash shown state.
 * Same key is used in index.html (plain JS) for pre-React splash skip.
 */
const SPLASH_SHOWN_KEY = 'chatic-splash-shown';

const getInitialShown = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return sessionStorage.getItem(SPLASH_SHOWN_KEY) === 'true';
    } catch {
        return false;
    }
};

interface SplashStore {
    /** 현재 세션에서 스플래시가 이미 표시되었는지 */
    isShown: boolean;
    /** 스플래시 표시 완료 플래그 저장 */
    markAsShown: () => void;
}

/**
 * Zustand store for managing splash screen state per session.
 * Uses sessionStorage to track whether splash was shown in current session.
 *
 * - Web: sessionStorage clears on tab close → splash replays on new tab
 * - Mobile WebView: sessionStorage clears on app restart → splash replays on fresh launch
 */
export const useSplashStore = create<SplashStore>()(set => ({
    isShown: getInitialShown(),
    markAsShown: () => {
        try {
            sessionStorage.setItem(SPLASH_SHOWN_KEY, 'true');
        } catch (_e) {
            /* sessionStorage may be unavailable */
        }
        set({ isShown: true });
    },
}));
