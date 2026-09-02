import { useSyncExternalStore } from 'react';

let isServiceUnavailable = false;

const listeners = new Set<() => void>();

const emit = (): void => {
    listeners.forEach(listener => listener());
};

export const getServiceUnavailable = (): boolean => isServiceUnavailable;

export const setServiceUnavailable = (value: boolean): void => {
    if (isServiceUnavailable === value) return;
    isServiceUnavailable = value;
    emit();
};

/**
 * Subscribes to the app-level service availability flag.
 */
export const useServiceUnavailable = (): boolean => {
    return useSyncExternalStore(
        listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getServiceUnavailable,
        getServiceUnavailable
    );
};
