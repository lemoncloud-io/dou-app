import { create } from 'zustand';

import { type ChannelHistory, EMPTY_HISTORY } from '../utils/channelHistory';

interface ChannelHistoryState extends ChannelHistory {
    set: (history: ChannelHistory) => void;
}

/**
 * The channel history Back and Forward step through on home. A store rather than HomePage state so
 * it outlives a trip to Settings and back, which unmounts the home page. Session only: a reload
 * starts it empty, like a fresh browser tab.
 */
export const useChannelHistoryStore = create<ChannelHistoryState>(set => ({
    ...EMPTY_HISTORY,
    set: history => set({ back: history.back, forward: history.forward }),
}));
