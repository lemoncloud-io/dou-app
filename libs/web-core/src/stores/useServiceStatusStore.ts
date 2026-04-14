import { create } from 'zustand';

interface ServiceStatusState {
    isServiceUnavailable: boolean;
    setServiceUnavailable: (value: boolean) => void;
}

export const useServiceStatusStore = create<ServiceStatusState>(set => ({
    isServiceUnavailable: false,
    setServiceUnavailable: (value: boolean) => set({ isServiceUnavailable: value }),
}));
