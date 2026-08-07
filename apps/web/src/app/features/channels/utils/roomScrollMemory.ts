/**
 * One-shot memory of where the room list was scrolled when the reader stepped into a thread.
 *
 * The room page unmounts on the way to a thread, so coming back re-mounts it and the reversed
 * list starts at scrollTop 0 — the bottom. Anyone reading history who taps a reply footer is
 * dropped at the newest message on their way back, losing the place they were reading.
 *
 * Deliberately one-shot and stashed only by the thread hop, not on every unmount: entering a
 * room from the home list should still land on the newest message, which is what a messenger
 * is expected to do. Restoring there would be a different (and wrong) behaviour.
 *
 * A plain module map rather than a store — nothing renders from this value. It is written on
 * the way out and read once on the way back in, and it holds one number per channel visited.
 */
const savedScrollTops = new Map<string, number>();

/** Remember the room's scroll offset for `channelId`. Called just before opening a thread. */
export const stashRoomScroll = (channelId: string, scrollTop: number): void => {
    savedScrollTops.set(channelId, scrollTop);
};

/**
 * Read and clear the saved offset. Returns null when there is nothing to restore — which is
 * every entry that did not come back from a thread.
 */
export const takeRoomScroll = (channelId: string): number | null => {
    const saved = savedScrollTops.get(channelId);
    if (saved === undefined) return null;
    savedScrollTops.delete(channelId);
    return saved;
};
