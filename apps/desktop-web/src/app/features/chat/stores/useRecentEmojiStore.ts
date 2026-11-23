import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deviceStore, persistStorageOver } from '../../../storage';

const RECENT_MAX = 16;

export const QUICK_REACTIONS = ['👍', '🆗'] as const;

interface RecentEmojiState {
    recent: string[];
    remember: (emoji: string) => void;
}

export const useRecentEmojiStore = create<RecentEmojiState>()(
    persist(
        set => ({
            recent: [],
            remember: emoji =>
                set(state => ({ recent: [emoji, ...state.recent.filter(e => e !== emoji)].slice(0, RECENT_MAX) })),
        }),
        { name: 'chatic.emoji.recent', storage: persistStorageOver(deviceStore) }
    )
);
