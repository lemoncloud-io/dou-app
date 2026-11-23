import { create } from 'zustand';

interface EmailBindRequestState {
    cloudId: string | null;
    requestEmailBind: (cloudId: string) => void;
    closeEmailBind: () => void;
}

export const useEmailBindRequest = create<EmailBindRequestState>(set => ({
    cloudId: null,
    requestEmailBind: cloudId => set({ cloudId }),
    closeEmailBind: () => set({ cloudId: null }),
}));
