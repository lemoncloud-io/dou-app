import { create } from 'zustand';

import type { ChannelSyncState, ChannelSyncStatus } from '../sync/ChatSyncScheduler';

export interface ChatSyncStoreState {
    states: Record<string, ChannelSyncState>;
    setChannelState: (channelId: string, state: Partial<ChannelSyncState>) => void;
    getChannelStatus: (channelId: string) => ChannelSyncStatus | null;
    /** 하나라도 pending 또는 syncing인 채널이 있는지 */
    isAnySyncing: () => boolean;
    reset: () => void;
}

export const useChatSyncStore = create<ChatSyncStoreState>((set, get) => ({
    states: {},

    setChannelState: (channelId, patch) =>
        set(prev => ({
            states: {
                ...prev.states,
                [channelId]: {
                    ...(prev.states[channelId] ?? {
                        status: 'pending' as const,
                        serverChatNo: 0,
                        localMaxChatNo: 0,
                        fetchedCount: 0,
                        totalGap: 0,
                    }),
                    ...patch,
                },
            },
        })),

    getChannelStatus: channelId => {
        const state = get().states[channelId];
        return state?.status ?? null;
    },

    isAnySyncing: () => {
        const states = get().states;
        return Object.values(states).some(s => s.status === 'pending' || s.status === 'syncing');
    },

    reset: () => set({ states: {} }),
}));
