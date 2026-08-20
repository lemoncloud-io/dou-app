import { create } from 'zustand';

/**
 * Seam for opening the subscribe-a-cloud flow from outside `features/subscription`.
 *
 * The flow (quota check → plan picker → email verify → IAP) belongs to the subscription feature, but
 * the affordances that start it live on home. Features do not import each other (ADR-0046 §3), so
 * home only raises a request here and `AddCloudFlowHost` — mounted by the runtime, which is allowed
 * to know features — picks it up. Not persisted: it exists for the length of one interaction.
 */
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
