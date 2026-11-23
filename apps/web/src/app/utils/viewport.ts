export const getViewportSize = (): { width: number; height: number } => {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    const doc = document.documentElement;
    return {
        width: window.innerWidth || doc?.clientWidth || 0,
        height: window.innerHeight || doc?.clientHeight || 0,
    };
};
