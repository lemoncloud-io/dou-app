import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** How many picks to remember. The picker's "recently used" tab shows all of them. */
const RECENT_MAX = 16;

/**
 * What a reader sees before they have picked anything. Deliberately the three that
 * carry the most meaning with the least ambiguity — agreement, warmth, acknowledged —
 * rather than the first three of any category.
 */
export const DEFAULT_QUICK_EMOJI = ['👍', '❤️', '😄'] as const;

interface RecentEmojiState {
    /** Most recent first. */
    recent: string[];
    remember: (emoji: string) => void;
}

/**
 * Device-local record of which emoji this person actually reaches for.
 *
 * A store rather than state inside the picker because two surfaces read it: the
 * picker's "recently used" tab, and the quick-reaction buttons in the message
 * toolbar. Kept in one place, a pick from either updates both without a reload.
 *
 * Local to the device on purpose — this is a habit, not account data, and there is
 * no server field for it.
 */
export const useRecentEmojiStore = create<RecentEmojiState>()(
    persist(
        set => ({
            recent: [],
            remember: emoji =>
                set(state => ({ recent: [emoji, ...state.recent.filter(e => e !== emoji)].slice(0, RECENT_MAX) })),
        }),
        { name: 'chatic.emoji.recent' }
    )
);

/**
 * The emoji to offer as one-click reactions, newest habit first.
 *
 * Falls back to the defaults only while there is no history at all, and tops up a
 * short history rather than showing one lonely button — the row should be the same
 * width every time, so it stays somewhere the hand can learn.
 */
export const quickEmoji = (recent: string[], count = 3): string[] => {
    const seen = new Set(recent.slice(0, count));
    const filler = DEFAULT_QUICK_EMOJI.filter(e => !seen.has(e));
    return [...recent.slice(0, count), ...filler].slice(0, count);
};
