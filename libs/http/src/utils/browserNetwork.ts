export const isBrowserOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;
