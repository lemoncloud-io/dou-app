/**
 * Whether a WEBVIEW_URL-relative path opens a chat room: the canonical `/channels/<id>/room`
 * (a trailing slash included, which this runtime's URL parsing can add) or the spec-style
 * `/channel?channelId=<id>` the web normalizes to it.
 *
 * Only such a navigation starts a room-open trace. Any other one would never be stopped, and the
 * SDK keeps a started trace in native memory until it is.
 */
export const isChannelRoomPath = (path: string): boolean =>
    /^\/channels\/[^/?#]+\/room\/?(?:[?#]|$)/.test(path) || /^\/channel\/?\?(?:[^#]*&)?channelId=[^&#]+/.test(path);
