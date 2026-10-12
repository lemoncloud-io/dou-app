/**
 * Channels with a live read-receipt driver — a mounted ChatPane advancing their
 * read cursor as messages arrive (see `useReadReceipts`). Badge hooks consult
 * this instead of the selected-channel store: selection survives route changes
 * that unmount the pane, but a cursor only advances while its driver is mounted.
 */
const liveReadChannels = new Set<string>();

/** Whether anything is advancing this channel's read cursor live right now. */
export const isChannelReadLive = (channelId: string): boolean => liveReadChannels.has(channelId);

/**
 * Register a live reader for a channel. The returned callback unregisters —
 * call it on unmount or channel switch, so a departed reader stops suppressing
 * refetches for its channel.
 */
export const registerLiveRead = (channelId: string): (() => void) => {
    liveReadChannels.add(channelId);
    return () => {
        liveReadChannels.delete(channelId);
    };
};
