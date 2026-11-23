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

export const runtimeHold = createRuntimeHold();
