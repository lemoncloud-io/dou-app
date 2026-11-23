import { create } from 'zustand';

interface AddCloudRequestState {
    isOpen: boolean;
    requestAddCloud: () => void;
    closeAddCloud: () => void;
}

export const useAddCloudRequest = create<AddCloudRequestState>(set => ({
    isOpen: false,
    requestAddCloud: () => set({ isOpen: true }),
    closeAddCloud: () => set({ isOpen: false }),
}));
