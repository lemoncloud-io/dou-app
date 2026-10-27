export interface StorageAdapter {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
}

const noopAdapter: StorageAdapter = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
};

/**
 * The default adapter, decided once at import. Guarded like the stores below: where site data is
 * blocked, even `typeof sessionStorage` throws, and an unguarded line here would take the whole barrel
 * down with it — every app imports it at boot.
 */
const defaultAdapter = (): StorageAdapter => {
    try {
        return typeof sessionStorage !== 'undefined' ? sessionStorage : noopAdapter;
    } catch {
        return noopAdapter;
    }
};

let _adapter: StorageAdapter = defaultAdapter();

export const setStorageAdapter = (adapter: StorageAdapter): void => {
    _adapter = adapter;
};

export const storage = {
    get: (key: string): string | null => _adapter.getItem(key),
    set: (key: string, value: string): void => _adapter.setItem(key, value),
    remove: (key: string): void => _adapter.removeItem(key),
};

/**
 * A browser store behind a guard: a read that fails answers `null`, a write that fails is dropped.
 *
 * Web storage throws in ordinary conditions — a full quota, a private window, a profile with site
 * data blocked — and in some of them even naming the global throws, so the store is looked up on
 * every call, inside the guard, never once at import. That is also what keeps this module safe in
 * React Native, which bundles this barrel and has no web storage at all: there every call is a no-op.
 *
 * For values that are a convenience — a draft, a panel width, a cached policy — where losing the
 * value is the right outcome and breaking the screen is not. A caller that has to know a write was
 * lost keeps its own `try`.
 */
const guarded = (resolve: () => StorageAdapter | undefined): StorageAdapter => ({
    getItem: key => {
        try {
            return resolve()?.getItem(key) ?? null;
        } catch {
            return null;
        }
    },
    setItem: (key, value) => {
        try {
            resolve()?.setItem(key, value);
        } catch {
            // Full or blocked: the value lives in memory, if at all, for this run.
        }
    },
    removeItem: key => {
        try {
            resolve()?.removeItem(key);
        } catch {
            // Nothing to do: there was nowhere it could have been kept.
        }
    },
});

/** `localStorage`, guarded. Survives a restart where the browser allows it. */
export const safeLocalStorage: StorageAdapter = guarded(() =>
    typeof localStorage === 'undefined' ? undefined : localStorage
);

/** `sessionStorage`, guarded. Survives a reload, not a restart. */
export const safeSessionStorage: StorageAdapter = guarded(() =>
    typeof sessionStorage === 'undefined' ? undefined : sessionStorage
);
