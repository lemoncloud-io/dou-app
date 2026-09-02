const listeners = new Set<() => void>();
const cacheInvalidators = new Set<() => void>();

export const subscribeSessionSignal = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const registerSessionCacheInvalidator = (fn: () => void): void => {
    cacheInvalidators.add(fn);
};

export const notifySessionStateChanged = (): void => {
    cacheInvalidators.forEach(fn => fn());
    listeners.forEach(listener => listener());
};
