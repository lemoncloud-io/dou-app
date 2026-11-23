export const isChannelRoomPath = (path: string): boolean =>
    /^\/channels\/[^/?#]+\/room\/?(?:[?#]|$)/.test(path) || /^\/channel\/?\?(?:[^#]*&)?channelId=[^&#]+/.test(path);
