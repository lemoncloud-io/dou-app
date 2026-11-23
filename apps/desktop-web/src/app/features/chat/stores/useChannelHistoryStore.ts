import { create } from 'zustand';

import { type ChannelHistory, EMPTY_HISTORY } from '../utils/channelHistory';

interface ChannelHistoryState extends ChannelHistory {
    set: (history: ChannelHistory) => void;
}

export const useChannelHistoryStore = create<ChannelHistoryState>(set => ({
    ...EMPTY_HISTORY,
    set: history => set({ back: history.back, forward: history.forward }),
}));
