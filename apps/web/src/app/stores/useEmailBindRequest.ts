import { create } from 'zustand';

/**
 * Seam for opening the "bind an email to this cloud" flow from outside `features/subscription`.
 *
 * A cloud can reach `active` with no email (a skipped purchase, or a skipped add-cloud request) —
 * see `needsEmailBind` (home) and `findUnboundClouds` (subscription). Fixing that is one dialog
 * owned by subscription, but the places that notice it (a cloud row in the switcher, a banner on
 * "구독 관리") are not; features do not import each other (ADR-0046 §3), so they raise a request
 * here and `EmailBindRequestHost` — mounted by the runtime, which is allowed to know features —
 * answers it. Not persisted: it exists for the length of one interaction.
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
