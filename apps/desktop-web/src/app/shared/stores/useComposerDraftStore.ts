import { create } from 'zustand';

interface ComposerDraftState {
    drafts: Record<string, string>;
    setDraft: (channelId: string, text: string) => void;
    clearDraft: (channelId: string) => void;
}

export const useComposerDraftStore = create<ComposerDraftState>(set => ({
    drafts: {},
    setDraft: (channelId, text) =>
        set(state => (state.drafts[channelId] === text ? state : { drafts: { ...state.drafts, [channelId]: text } })),
    clearDraft: channelId =>
        set(state => {
            const drafts = { ...state.drafts };
            delete drafts[channelId];
            return { drafts };
        }),
}));
