/**
 * Whether the app's runtime holds the session in this process, as the host reports it
 * (`NativeRuntimeHost.holdsSession`), for the offer injected into the next page load.
 *
 * A module of its own, with no imports, because the WebView reads it on every launch: the host's
 * module loads the whole runtime and stays off the startup path, so the host writes here and the
 * WebView only reads.
 */
export interface RuntimeHold {
    read(): boolean;
    set(held: boolean): void;
    subscribe(listener: () => void): () => void;
}

export const createRuntimeHold = (): RuntimeHold => {
    let held = false;
    const listeners = new Set<() => void>();
    return {
        read: () => held,
        set: next => {
            if (held === next) return;
            held = next;
            listeners.forEach(listener => listener());
        },
        subscribe: listener => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
};

/** The process's one hold. */
export const runtimeHold = createRuntimeHold();
