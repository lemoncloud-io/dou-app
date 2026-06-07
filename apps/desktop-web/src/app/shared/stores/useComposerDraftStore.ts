import { create } from 'zustand';

interface ComposerDraftState {
    /** channelId → unsent composer text, preserved across channel switches. */
    drafts: Record<string, string>;
    setDraft: (channelId: string, text: string) => void;
    clearDraft: (channelId: string) => void;
}

/**
 * Keeps each channel's half-typed message so switching channels (and back)
 * doesn't lose it. Session-scoped — drafts are intentionally not persisted.
 */
export const useComposerDraftStore = create<ComposerDraftState>(set => ({
    drafts: {},
    setDraft: (channelId, text) => set(state => ({ drafts: { ...state.drafts, [channelId]: text } })),
    clearDraft: channelId =>
        set(state => {
            if (!(channelId in state.drafts)) return state;
            const drafts = { ...state.drafts };
            delete drafts[channelId];
            return { drafts };
        }),
}));
