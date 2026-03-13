import type { ChannelView } from '@lemoncloud/chatic-socials-api';

export type { ChannelView as Channel };

/**
 * Storage adapter interface for persisting channel data.
 * Supports IndexedDB (web) and native storage (React Native WebView).
 */
export interface ChannelStorageAdapter {
    /** Save all channels for a user, replacing existing data */
    saveAll(userId: string, channels: ChannelView[]): Promise<void>;
    /** Load all channels for a user */
    loadAll(userId: string): Promise<ChannelView[]>;
    /** Save or update a single channel */
    save(userId: string, channel: ChannelView): Promise<void>;
    /** Remove a channel by ID */
    remove(userId: string, channelId: string): Promise<void>;
    /** Clear all channels for a user */
    clear(userId: string): Promise<void>;
}
