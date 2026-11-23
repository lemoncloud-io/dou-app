export type Theme = 'dark' | 'light' | 'system';

export type ChannelSortMethod = 'recent' | 'unread';

export const DEFAULT_CHANNEL_SORT: ChannelSortMethod = 'recent';

export type HomeSectionId = 'places' | 'channels' | 'cloudDm';

export const CLOUD_PROMO_DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

export const MAX_RECENT_SEARCHES = 10;
