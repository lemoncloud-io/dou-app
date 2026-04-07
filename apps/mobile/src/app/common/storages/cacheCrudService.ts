import {
    channelDataSource,
    chatDataSource,
    cloudDataSource,
    joinDataSource,
    siteDataSource,
    userDataSource,
    userTokenDataSource,
    inviteCloudDataSource,
} from './sqlite';
import type { CacheType } from '@chatic/app-messages';

/**
 * Registry mapping each CacheType to its specific SQLite Data Source instance.
 */
const DS_MAP: Record<CacheType, any> = {
    chat: chatDataSource,
    channel: channelDataSource,
    user: userDataSource,
    cloud: cloudDataSource,
    join: joinDataSource,
    site: siteDataSource,
    usertoken: userTokenDataSource,
    invitecloud: inviteCloudDataSource,
};

/**
 * The central Facade for all local storage operations in the app.
 * Routes requests to either synchronous asynchronous SQLite (for domain data).
 * Enforces strict validation for `cid` (Cloud ID) based on whether the data type is scoped or default.
 */
export const cacheCrudService = {
    /**
     * Retrieves a single cached item.
     * Automatically handles the `cid` parameter depending on whether the domain is scoped or default.
     */
    fetch: async (payload: { type: CacheType; id: string; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return null;

        return ds.fetch(payload.id, payload.cid);
    },

    /**
     * Retrieves multiple cached items.
     * Includes domain-specific logic to apply query filters (e.g., channelId, userId, sort) before fetching.
     */
    fetchAll: async (payload: { type: CacheType; query?: any }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return [];

        const { cid, channelId, userId, sort, sid } = payload.query || {};

        if (payload.type === 'chat' && (channelId || sort)) {
            return chatDataSource.fetchChats(cid, channelId, sort);
        }
        if (payload.type === 'join' && (channelId || userId)) {
            return joinDataSource.fetchJoins(cid, { channelId, userId });
        }
        if (payload.type === 'channel' && sid) {
            return channelDataSource.fetchChannels(cid, sid);
        }

        return ds.fetchAll(cid);
    },

    /**
     * Saves a single item to the cache.
     */
    save: async (payload: { type: CacheType; id: string; item: any; cid: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return payload.id;

        await ds.save(payload.id, payload.item, payload.cid);
        return payload.id;
    },

    /**
     * Batch saves multiple items to the cache for optimal insertion performance.
     */
    saveAll: async (payload: { type: CacheType; items: any[]; cid: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return [];

        const formattedItems = payload.items.map(item => ({
            id: item.id,
            data: item,
        }));

        await ds.saveAll(formattedItems, payload.cid);
        return payload.items.map(i => i.id);
    },

    /**
     * Deletes a single item from the cache.
     */
    delete: async (payload: { type: CacheType; id: string; cid: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return payload.id;

        await ds.remove(payload.id, payload.cid);
        return payload.id;
    },

    /**
     * Batch deletes multiple items from the cache for optimal performance.
     */
    deleteAll: async (payload: { type: CacheType; ids: string[]; cid: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return [];

        await ds.removeAll(payload.ids, payload.cid);
        return payload.ids;
    },
};
