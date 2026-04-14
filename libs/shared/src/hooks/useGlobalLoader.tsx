import { create } from 'zustand';

const LOADER_TIMEOUT_MS = 30_000;

interface LoaderState {
    isLoading: boolean;
    message?: string;
    setIsLoading: (isLoading: boolean, message?: string) => void;
}

// Timeout ID stored in closure, not in state — avoids unnecessary re-renders
let loaderTimeoutId: ReturnType<typeof setTimeout> | null = null;

export const useLoaderStore = create<LoaderState>(set => ({
    isLoading: false,
    message: undefined,
    setIsLoading: (isLoading: boolean, message?: string) => {
        if (loaderTimeoutId) {
            clearTimeout(loaderTimeoutId);
            loaderTimeoutId = null;
        }

        if (isLoading) {
            loaderTimeoutId = setTimeout(() => {
                console.warn('[GlobalLoader] Safety timeout reached, auto-resetting loading state');
                loaderTimeoutId = null;
                set({ isLoading: false, message: undefined });
            }, LOADER_TIMEOUT_MS);
        }

        set({ isLoading, message });
    },
}));

export const useGlobalLoader = () => {
    const isLoading = useLoaderStore(state => state.isLoading);
    const message = useLoaderStore(state => state.message);
    const setIsLoading = useLoaderStore(state => state.setIsLoading);

    return { isLoading, message, setIsLoading };
};
