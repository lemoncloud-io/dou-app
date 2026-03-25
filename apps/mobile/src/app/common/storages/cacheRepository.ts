import {
    chatDataSource,
    channelDataSource,
    userDataSource,
    cloudDataSource,
    joinDataSource,
    siteDataSource,
    userTokenDataSource,
} from './sqlite';

import { preferenceStore } from './mmkv';
import type { CacheType } from '@chatic/app-messages';
import { logger } from '../services';

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
};

/**
 * List of domain types that act as global/default storages.
 * These domains DO NOT require a Cloud ID (`cid`) for any of their operations.
 */
const DEFAULT_DS_TYPES: [CacheType] = ['cloud'];

/**
 * The central Facade for all local storage operations in the app.
 * Routes requests to either synchronous MMKV (for preferences) or asynchronous SQLite (for domain data).
 * Enforces strict validation for `cid` (Cloud ID) based on whether the data type is scoped or default.
 */
export const cacheRepository = {
    // --- Preferences (MMKV) ---
    getPreference: (key: string) => preferenceStore.get(key as any),
    savePreference: (key: string, value: any) => preferenceStore.set(key as any, value),
    removePreference: (key: string) => preferenceStore.remove(key as any),

    // --- Data Sources (SQLite) ---

    /**
     * Retrieves a single cached item.
     * Automatically handles the `cid` parameter depending on whether the domain is scoped or default.
     */
    fetch: async (payload: { type: CacheType; id: string; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return null;

        return DEFAULT_DS_TYPES.includes(payload.type) ? ds.fetch(payload.id) : ds.fetch(payload.id, payload.cid);
    },

    /**
     * Retrieves multiple cached items.
     * Includes domain-specific logic to apply query filters (e.g., channelId, userId, sort) before fetching.
     */
    fetchAll: async (payload: { type: CacheType; query?: any }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return [];

        const { cid, channelId, userId, sort } = payload.query || {};

        // 도메인 특화 로직 처리 (Chat, Join 등)
        if (payload.type === 'chat' && (channelId || sort)) {
            return chatDataSource.fetchChats(cid, channelId, sort);
        }
        if (payload.type === 'join' && (channelId || userId)) {
            return joinDataSource.fetchJoins(cid, { channelId, userId });
        }

        return DEFAULT_DS_TYPES.includes(payload.type) ? ds.fetchAll() : ds.fetchAll(cid);
    },

    /**
     * Saves a single item to the cache.
     * FAST-FAIL: Logs an error and skips saving if a scoped domain attempts to save without a `cid`.
     */
    save: async (payload: { type: CacheType; id: string; item: any; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return payload.id;

        if (DEFAULT_DS_TYPES.includes(payload.type)) {
            await ds.save(payload.id, payload.item);
        } else {
            if (!payload.cid) {
                logger.error('CACHE', `cid is strictly required to save type: ${payload.type}`);
                return payload.id;
            }
            await ds.save(payload.id, payload.item, payload.cid);
        }
        return payload.id;
    },

    /**
     * Batch saves multiple items to the cache for optimal insertion performance.
     * FAST-FAIL: Logs an error and skips saving if a scoped domain attempts to save without a `cid`.
     */
    saveAll: async (payload: { type: CacheType; items: any[]; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return [];

        const formattedItems = payload.items.map(item => ({
            id: item.id,
            data: item,
        }));

        if (DEFAULT_DS_TYPES.includes(payload.type)) {
            await ds.saveAll(formattedItems);
        } else {
            if (!payload.cid) {
                logger.error('CACHE', `cid is strictly required to saveAll type: ${payload.type}`);
                return [];
            }
            await ds.saveAll(formattedItems, payload.cid);
        }
        return payload.items.map(i => i.id);
    },

    /**
     * Deletes a single item from the cache.
     * FAST-FAIL: Logs an error and skips deletion if a scoped domain attempts to delete without a `cid`.
     */
    delete: async (payload: { type: CacheType; id: string; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return payload.id;

        if (DEFAULT_DS_TYPES.includes(payload.type)) {
            await ds.remove(payload.id);
        } else {
            if (!payload.cid) {
                logger.error('CACHE', `cid is strictly required to delete type: ${payload.type}`);
                return payload.id;
            }
            await ds.remove(payload.id, payload.cid);
        }
        return payload.id;
    },

    /**
     * Batch deletes multiple items from the cache for optimal performance.
     * FAST-FAIL: Logs an error and skips deletion if a scoped domain attempts to delete without a `cid`.
     */
    deleteAll: async (payload: { type: CacheType; ids: string[]; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return [];

        if (DEFAULT_DS_TYPES.includes(payload.type)) {
            await ds.removeAll(payload.ids);
        } else {
            if (!payload.cid) {
                logger.error('CACHE', `cid is strictly required to deleteAll type: ${payload.type}`);
                return [];
            }
            await ds.removeAll(payload.ids, payload.cid);
        }
        return payload.ids;
    },
};
