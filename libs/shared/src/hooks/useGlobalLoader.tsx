import { create } from 'zustand';

interface LoaderState {
    isLoading: boolean;
    message?: string;
    setIsLoading: (isLoading: boolean, message?: string) => void;
}

export const useLoaderStore = create<LoaderState>(set => ({
    isLoading: false,
    message: undefined,
    setIsLoading: (isLoading: boolean, message?: string) => set({ isLoading, message }),
}));

export const useGlobalLoader = () => {
    const isLoading = useLoaderStore(state => state.isLoading);
    const message = useLoaderStore(state => state.message);
    const setIsLoading = useLoaderStore(state => state.setIsLoading);

    return { isLoading, message, setIsLoading };
};
