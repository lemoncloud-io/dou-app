export const SUB_WEBVIEW_CLOSE_FORCE_WINDOW_MS = 3000;

export interface SubWebViewCloseGuard {
    setEnabled(enabled: boolean): void;
    decide(now: number): 'close' | 'ask';
}

export const createSubWebViewCloseGuard = (): SubWebViewCloseGuard => {
    let enabled = false;
    let askedAt: number | null = null;
    return {
        setEnabled(value) {
            enabled = value;
        },
        decide(now) {
            if (!enabled) return 'close';
            if (askedAt !== null && now - askedAt <= SUB_WEBVIEW_CLOSE_FORCE_WINDOW_MS) return 'close';
            askedAt = now;
            return 'ask';
        },
    };
};
