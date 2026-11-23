let hides = 0;
let watching = false;

export const pageHideCount = (): number => {
    if (!watching && typeof document !== 'undefined') {
        watching = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') hides += 1;
        });
    }
    return hides;
};

export const isPageHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';
