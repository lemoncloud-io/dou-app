import { create } from 'zustand';

interface LoaderState {
    isLoading: boolean;
    setIsLoading: (isLoading: boolean) => void;
}

export const useLoaderStore = create<LoaderState>(set => ({
    isLoading: false,
    setIsLoading: (isLoading: boolean) => set({ isLoading }),
}));

export const useGlobalLoader = () => {
    const isLoading = useLoaderStore(state => state.isLoading);
    const setIsLoading = useLoaderStore(state => state.setIsLoading);

    return { isLoading, setIsLoading };
};
