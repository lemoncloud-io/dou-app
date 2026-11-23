import { create } from 'zustand';

export const HOME_CHAT_TABS = ['all', 'group', 'dm'] as const;
export type HomeChatTab = (typeof HOME_CHAT_TABS)[number];

interface HomeChatTabState {
    tab: HomeChatTab;
    setTab: (tab: HomeChatTab) => void;
}

export const useHomeChatTabStore = create<HomeChatTabState>(set => ({
    tab: 'all',
    setTab: tab => set({ tab }),
}));
