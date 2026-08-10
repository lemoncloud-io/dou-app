/**
 * Memory of where the room list was scrolled when the reader last left it.
 *
 * The room page unmounts on every exit — into a thread, back to the home list, anywhere — so
 * re-entering re-mounts it and the reversed list starts at scrollTop 0, the bottom. Anyone who
 * was reading history is dropped at the newest message on the way back, losing their place.
 *
 * Written on unmount (see useChatScroll) rather than by any one caller, so every route out of the
 * room is covered without each of them having to remember. Entering a room the reader has never
 * scrolled — or left sitting at the bottom — stashes 0, which restores as the bottom, so the
 * common case still behaves like a messenger.
 *
 * A plain module map rather than a store — nothing renders from this value. It is written on the
 * way out and read once on the way back in, and it holds one number per channel visited. Memory
 * only: a reload is a fresh start, and lands on the newest message.
 */
const savedScrollTops = new Map<string, number>();

/** Remember the room's scroll offset for `channelId`. Called as the room unmounts. */
export const stashRoomScroll = (channelId: string, scrollTop: number): void => {
    savedScrollTops.set(channelId, scrollTop);
};

/**
 * Read and clear the saved offset. Returns null the first time a room is opened in this session;
 * after that the unmount stash always refreshes it, so clearing on read only keeps a single mount
 * from claiming the same offset twice.
 */
export const takeRoomScroll = (channelId: string): number | null => {
    const saved = savedScrollTops.get(channelId);
    if (saved === undefined) return null;
    savedScrollTops.delete(channelId);
    return saved;
};
