type RefreshHandler = () => Promise<void>;

let handler: RefreshHandler | null = null;

export const registerBackgroundRefresh = (next: RefreshHandler): (() => void) => {
    handler = next;
    return () => {
        if (handler === next) handler = null;
    };
};

export const requestBackgroundRefresh = (): Promise<void> => (handler ? handler() : Promise.resolve());
