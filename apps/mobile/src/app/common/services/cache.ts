import { storageService } from './mmkv';
import type {
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    FetchAllCacheDataPayload,
    FetchCacheDataPayload,
    PreferenceKey,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
} from '@chatic/app-messages';
import type { ChannelView, ChatView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';
import type { CloudView, SiteView, UserTokenView } from '@lemoncloud/chatic-backend-api';

const PREFIX = {
    CHANNEL: 'channel',
    CLOUD: 'cloud',
    CHAT: 'chat',
    USER: 'user',
    JOIN: 'join',
    SITE: 'site',
    USERTOKEN: 'usertoken',
    PREF: 'pref',
} as const;

/**
 * 도메인별 관리 키 정보 생성기
 * - channel: channelId / cloudId
 * - cloud: cloudId
 * - chat: chatId / cloudId
 * - user: userId / cloudId
 * - join: joinId / cloudId
 * - site: siteId / cloudId
 * - usertoken: userId / cloudId
 */
const Keys = {
    channel: (id: string, cid: string) => `${PREFIX.CHANNEL}:${cid}:${id}`,
    cloud: (id: string) => `${PREFIX.CLOUD}:${id}`,
    chat: (id: string, cid: string) => `${PREFIX.CHAT}:${cid}:${id}`,
    user: (id: string, cid: string) => `${PREFIX.USER}:${cid}:${id}`,
    join: (id: string, cid: string) => `${PREFIX.JOIN}:${cid}:${id}`,
    site: (id: string, cid: string) => `${PREFIX.SITE}:${cid}:${id}`,
    usertoken: (id: string, cid: string) => `${PREFIX.USERTOKEN}:${cid}:${id}`,
    preference: (key: string) => `${PREFIX.PREF}:${key}`,
} as const;

/**
 * Retrieves all cached data of a specific type from local storage.
 * Constructs a prefix based on the type and optional context ID (cid),
 * finds all matching keys, and fetches their values in parallel for optimal performance.
 *
 * @template T The expected type of the cached items.
 * @param prefixType The domain type prefix (e.g., 'chat', 'channel', 'user').
 * @param cid Optional Cloud ID or Context ID to further narrow down the keys.
 * @returns A promise that resolves to an array of cached items of type T.
 */
const getAllData = async <T>(prefixType: string, cid?: string): Promise<T[]> => {
    const prefix = cid ? `${prefixType}:${cid}:` : `${prefixType}:`;

    const keys = storageService.getAllKeys().filter(k => k.startsWith(prefix));
    const results = await Promise.all(keys.map(k => storageService.get<T>(k)));
    return results.filter(item => item !== null) as T[];
};

export const cacheRepository = {
    getPreference: async <T = any>(key: PreferenceKey): Promise<T | null> => {
        return storageService.get<T>(Keys.preference(key));
    },
    savePreference: async <T = any>(key: PreferenceKey, value: T): Promise<void> => {
        return storageService.set(Keys.preference(key), value);
    },
    removePreference: async (key: PreferenceKey): Promise<void> => {
        return storageService.remove(Keys.preference(key));
    },

    // Fetch 단일 (CID 필수)
    fetch: async (payload: FetchCacheDataPayload): Promise<any | null> => {
        const { id, cid } = payload;
        switch (payload.type) {
            case 'channel':
                return await storageService.get<ChannelView>(Keys.channel(id, cid));
            case 'chat':
                return await storageService.get<ChatView>(Keys.chat(id, cid));
            case 'cloud':
                return await storageService.get<CloudView>(Keys.cloud(id));
            case 'user':
                return await storageService.get<UserView>(Keys.user(id, cid));
            case 'join':
                return await storageService.get<JoinView>(Keys.join(id, cid));
            case 'site':
                return await storageService.get<SiteView>(Keys.site(id, cid));
            case 'usertoken':
                return await storageService.get<UserTokenView>(Keys.usertoken(id, cid));
        }
    },

    // Fetch 다수
    fetchAll: async (payload: FetchAllCacheDataPayload): Promise<any[]> => {
        switch (payload.type) {
            case 'channel': {
                const { cid, sid } = payload.query || {};
                const channels = await getAllData<ChannelView>(PREFIX.CHANNEL, cid);

                if (sid) {
                    return channels.filter(channel => channel.sid === sid);
                }
                return channels;
            }

            case 'chat': {
                const { cid, channelId, sort } = payload.query || {};

                //  Fetch all chats (filtered by cloud ID if provided)
                const chats = await getAllData<ChatView>(PREFIX.CHAT, cid);

                // Filter by channelId if explicitly requested
                const result = channelId ? chats.filter(chat => chat.channelId === channelId) : chats;

                //  Sort by createdAt timestamp if a sort direction is specified
                if (sort) {
                    result.sort((a, b) => {
                        const timeA = a.createdAt ?? 0;
                        const timeB = b.createdAt ?? 0;
                        return sort === 'asc' ? timeA - timeB : timeB - timeA;
                    });
                }

                return result;
            }
            case 'cloud': {
                return await getAllData<CloudView>(PREFIX.CLOUD);
            }
            case 'user': {
                const { cid } = payload.query || {};
                return await getAllData<UserView>(PREFIX.USER, cid);
            }
            case 'join': {
                const { cid, channelId } = payload.query || {};
                const joins = await getAllData<JoinView>(PREFIX.JOIN, cid);

                if (channelId) {
                    return joins.filter(join => join.channelId === channelId);
                }

                return joins;
            }
            case 'site': {
                const { cid } = payload.query || {};
                return await getAllData<SiteView>(PREFIX.SITE, cid);
            }
            case 'usertoken': {
                const { cid } = payload.query || {};
                return await getAllData<UserTokenView>(PREFIX.USERTOKEN, cid);
            }
        }
    },

    // Save 단일 (CID 필수)
    save: async (payload: SaveCacheDataPayload): Promise<string> => {
        const { id, item, cid } = payload;
        switch (payload.type) {
            case 'channel':
                await storageService.set(Keys.channel(id, cid), item);
                break;
            case 'chat':
                await storageService.set(Keys.chat(id, cid), item);
                break;
            case 'cloud':
                await storageService.set(Keys.cloud(id), item);
                break;
            case 'user':
                await storageService.set(Keys.user(id, cid), item);
                break;
            case 'join':
                await storageService.set(Keys.join(id, cid), item);
                break;
            case 'site':
                await storageService.set(Keys.site(id, cid), item);
                break;
            case 'usertoken':
                await storageService.set(Keys.usertoken(id, cid), item);
                break;
        }
        return payload.id;
    },

    // Save 다수 (CID 필수)
    saveAll: async (payload: SaveAllCacheDataPayload): Promise<string[]> => {
        const { items, cid } = payload;
        const ids: string[] = [];

        await Promise.all(
            items.map(async (item: any) => {
                const id = item.id;
                if (id) {
                    await cacheRepository.save({
                        type: payload.type,
                        id,
                        item,
                        cid: cid,
                    } as any);
                    ids.push(id);
                }
            })
        );
        return ids;
    },

    // Delete 단일 (CID 필수)
    delete: async (payload: DeleteCacheDataPayload): Promise<string> => {
        const { id, cid } = payload;
        switch (payload.type) {
            case 'channel':
                await storageService.remove(Keys.channel(id, cid));
                break;
            case 'chat':
                await storageService.remove(Keys.chat(id, cid));
                break;
            case 'cloud':
                await storageService.remove(Keys.cloud(id));
                break;
            case 'user':
                await storageService.remove(Keys.user(id, cid));
                break;
            case 'join':
                await storageService.remove(Keys.join(id, cid));
                break;
            case 'site':
                await storageService.remove(Keys.site(id, cid));
                break;
            case 'usertoken':
                await storageService.remove(Keys.usertoken(id, cid));
                break;
        }
        return payload.id;
    },

    // Delete 다수 (CID 필수)
    deleteAll: async (payload: DeleteAllCacheDataPayload): Promise<string[]> => {
        const { ids, cid } = payload;
        if (!ids || ids.length === 0) return [];

        await Promise.all(
            ids.map(id =>
                cacheRepository.delete({
                    type: payload.type,
                    id,
                    cid: cid,
                } as any)
            )
        );
        return payload.ids;
    },
};
