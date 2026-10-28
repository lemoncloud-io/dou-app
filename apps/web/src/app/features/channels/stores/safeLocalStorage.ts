import type { StateStorage } from 'zustand/middleware';

/**
 * localStorage behind a guard, for the composer's device-only state (drafts, input locks). That state
 * is a convenience: storage that is full, blocked or missing (a private window, a WebView with storage
 * off) must cost the saved value, never the composer it sits under.
 */
export const safeLocalStorage: StateStorage = {
    getItem: name => {
        try {
            return localStorage.getItem(name);
        } catch {
            return null;
        }
    },
    setItem: (name, value) => {
        try {
            localStorage.setItem(name, value);
        } catch {
            // Full or blocked: the value lives in memory for this run instead.
        }
    },
    removeItem: name => {
        try {
            localStorage.removeItem(name);
        } catch {
            // Nothing to do: there was nowhere it could have been kept.
        }
    },
};
