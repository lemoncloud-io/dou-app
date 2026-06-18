const listeners = new Set<() => void>();

export const subscribeSessionSignal = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const notifySessionStateChanged = (): void => {
    listeners.forEach(listener => listener());
};
