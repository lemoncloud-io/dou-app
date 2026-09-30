import { create } from 'zustand';

interface ComposerFocusState {
    /** The channel whose removal asked for focus; null when nothing is pending. */
    removedId: string | null;
    request: (removedId: string) => void;
    consume: () => void;
}

/**
 * One-shot "put focus in the next room" request, set when a channel is deleted or left. The
 * confirm dialog has already closed by the time the removal resolves, and the header it returned
 * focus to goes with the room, so nothing on screen owns focus any more. ChatPane spends the
 * request on the first room it shows that is not the removed one — or on the empty state when no
 * room is left — so a later plain channel switch never takes focus. Keyed by the removed id
 * because the pane can briefly land on that channel again before the list drops it.
 */
export const useComposerFocusStore = create<ComposerFocusState>(set => ({
    removedId: null,
    request: removedId => set({ removedId }),
    consume: () => set({ removedId: null }),
}));
