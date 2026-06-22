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

export const readLocalJson = <T>(key: string): T | null => {
    try {
        const cached = localStorage.getItem(key);
        return cached ? (JSON.parse(cached) as T) : null;
    } catch {
        return null;
    }
};

export const writeLocalJson = (key: string, value: unknown | null): void => {
    try {
        if (value == null) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
        }
    } catch {
        // ignore
    }
};
