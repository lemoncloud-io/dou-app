import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Ported from apps/desktop-web `features/chat/stores/useRecentEmojiStore.ts` (ADR-0045).
 * The storage key is shared on purpose — desktop and mobile web are different devices,
 * so the lists never actually collide, but a person switching builds on one device
 * keeps their habits.
 */

/** How many picks to remember. The picker's "recently used" tab shows all of them. */
const RECENT_MAX = 16;

/**
 * The one-tap reactions on the message action sheet.
 *
 * Fixed, and deliberately not driven by the recently-used list. Reordering these on
 * every pick defeats the point of having them: the value of a button in a known spot
 * is that the hand learns where it is, and a row that rearranges itself has to be
 * read every time — slower than the picker it was meant to replace.
 *
 * Two, not more. These are the answers that need no words — agreement and
 * acknowledgement; anything with actual meaning behind it belongs in the picker.
 */
export const QUICK_REACTIONS = ['👍', '🆗'] as const;

interface RecentEmojiState {
    /** Most recent first. */
    recent: string[];
    remember: (emoji: string) => void;
}

/**
 * Device-local record of which emoji this person actually reaches for.
 *
 * A store rather than state inside the picker because two surfaces read it: the
 * picker's "recently used" tab, and the quick-reaction row on the action sheet.
 * Kept in one place, a pick from either updates both without a reload.
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
