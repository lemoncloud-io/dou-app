/**
 * Current viewport size, or `{0, 0}` when it is not measurable yet — inside a
 * WebView before first layout, or in a headless environment. Callers decide the
 * fallback rather than getting a silently wrong `0`.
 */
export const getViewportSize = (): { width: number; height: number } => {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    const doc = document.documentElement;
    return {
        width: window.innerWidth || doc?.clientWidth || 0,
        height: window.innerHeight || doc?.clientHeight || 0,
    };
};
