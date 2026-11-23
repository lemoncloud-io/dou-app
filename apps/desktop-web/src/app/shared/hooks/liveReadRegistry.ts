const liveReadChannels = new Set<string>();

export const isChannelReadLive = (channelId: string): boolean => liveReadChannels.has(channelId);

export const registerLiveRead = (channelId: string): (() => void) => {
    liveReadChannels.add(channelId);
    return () => {
        liveReadChannels.delete(channelId);
    };
};
