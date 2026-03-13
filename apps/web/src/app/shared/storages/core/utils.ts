export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && window.ReactNativeWebView !== undefined;
};
