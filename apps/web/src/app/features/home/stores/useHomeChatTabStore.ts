import { create } from 'zustand';

/** The cloud home's conversation tabs, in display order. */
export const HOME_CHAT_TABS = ['all', 'group', 'dm'] as const;
export type HomeChatTab = (typeof HOME_CHAT_TABS)[number];

interface HomeChatTabState {
    tab: HomeChatTab;
    setTab: (tab: HomeChatTab) => void;
}

/**
 * Which conversation tab the cloud home shows. Held in memory, outside the page, so coming back
 * from a room lands on the tab that was left — home unmounts on every navigation — while a relaunch
 * starts on "all" again: the tab is how home is being used right now, not a preference.
 */
export const useHomeChatTabStore = create<HomeChatTabState>(set => ({
    tab: 'all',
    setTab: tab => set({ tab }),
}));
