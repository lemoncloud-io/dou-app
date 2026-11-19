import { create } from 'zustand';

/**
 * Seam for opening the "bind an email to this cloud" flow from outside `features/subscription`.
 *
 * A cloud is created with no email, and its recovery email is registered from cloud management
 * only (the cloud information screen). The dialog is owned by subscription, but that screen lives in
 * `features/mypage`; features do not import each other, so it raises a request here and
 * `EmailBindRequestHost` — mounted by the runtime, which is allowed to know features — answers it.
 * Not persisted: it exists for the length of one interaction.
 */
interface EmailBindRequestState {
    /** The cloud awaiting an email, or `null` when nothing is requested. */
    cloudId: string | null;
    requestEmailBind: (cloudId: string) => void;
    closeEmailBind: () => void;
}

export const useEmailBindRequest = create<EmailBindRequestState>(set => ({
    cloudId: null,
    requestEmailBind: cloudId => set({ cloudId }),
    closeEmailBind: () => set({ cloudId: null }),
}));
