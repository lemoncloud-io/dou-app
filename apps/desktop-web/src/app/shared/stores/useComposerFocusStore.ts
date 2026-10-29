import { create } from 'zustand';

interface ComposerFocusState {
    /** The channel whose removal asked for focus; null when nothing is pending. */
    removedId: string | null;
    /** While a rail chord's switch is in flight, the rooms it lands on must not take focus. */
    skipNext: boolean;
    request: (removedId: string) => void;
    consume: () => void;
    requestSkip: () => void;
    clearSkip: () => void;
}

/**
 * One-shot "put focus in the next room" request, set when a channel is deleted or left. The
 * confirm dialog has already closed by the time the removal resolves, and the header it returned
 * focus to goes with the room, so nothing on screen owns focus any more. ChatPane spends the
 * request on the first room it shows that is not the removed one — or on the empty state when no
 * room is left — so a later plain channel switch never takes focus. Keyed by the removed id
 * because the pane can briefly land on that channel again before the list drops it.
 *
 * `skipNext` is the opposite request: opening a room normally drops the caret in its message box
 * (`ChannelDraftPlugin`), which is right for a click and wrong for a reader stepping through the
 * rail by number — the next chord would type its character into that box instead of moving. It is
 * held for the whole switch rather than spent on the first room, because a switch can land on more
 * than one room (and a dev double-effect mounts each one twice); `HomePage` drops it once the switch
 * settles — or shortly after the chord when no switch followed — so it cannot leak onto a later
 * click.
 */
export const useComposerFocusStore = create<ComposerFocusState>(set => ({
    removedId: null,
    skipNext: false,
    request: removedId => set({ removedId }),
    consume: () => set({ removedId: null }),
    requestSkip: () => set({ skipNext: true }),
    clearSkip: () => set({ skipNext: false }),
}));
