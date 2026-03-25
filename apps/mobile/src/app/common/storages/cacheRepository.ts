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

const DS_MAP: Record<string, any> = {
    chat: chatDataSource,
    channel: channelDataSource,
    user: userDataSource,
    cloud: cloudDataSource,
    join: joinDataSource,
    site: siteDataSource,
    usertoken: userTokenDataSource,
};

export const cacheRepository = {
    // Preference
    getPreference: (key: string) => preferenceStore.get(key as any),
    savePreference: (key: string, value: any) => preferenceStore.set(key as any, value),
    removePreference: (key: string) => preferenceStore.remove(key as any),

    // DataSource
    fetch: async (payload: { type: string; id: string; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return null;
        return ds.fetch(payload.id, payload.cid);
    },

    fetchAll: async (payload: { type: string; query?: any }) => {
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

        return ds.fetchAll();
    },

    save: async (payload: { type: string; id: string; item: any; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return payload.id;
        await ds.save(payload.id, payload.item, payload.cid);
        return payload.id;
    },

    saveAll: async (payload: { type: string; items: any[]; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return [];

        const formattedItems = payload.items.map(item => ({
            id: item.id,
            data: item,
        }));

        await ds.saveAll(formattedItems, payload.cid);
        return payload.items.map(i => i.id);
    },

    delete: async (payload: { type: string; id: string; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return payload.id;
        await ds.remove(payload.id, payload.cid);
        return payload.id;
    },

    deleteAll: async (payload: { type: string; ids: string[]; cid?: string }) => {
        const ds = DS_MAP[payload.type];
        if (!ds) return [];
        await ds.removeAll(payload.ids, payload.cid);
        return payload.ids;
    },
};
