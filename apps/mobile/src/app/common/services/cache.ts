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
import type { SiteView, UserTokenView } from '@lemoncloud/chatic-backend-api';

const PREFIX = {
    CHANNEL: 'channel',
    CHAT: 'chat',
    USER: 'user',
    JOIN: 'join',
    SITE: 'site',
    USERTOKEN: 'usertoken',
    PREF: 'pref',
} as const;

/**
 * 도메인별 관리 키 정보 생성기
 * cid(Cloud ID)는 필수입니다.
 */
const Keys = {
    channel: (id: string, cid: string) => `${PREFIX.CHANNEL}:${cid}:${id}`,
    chat: (id: string, cid: string) => `${PREFIX.CHAT}:${cid}:${id}`,
    user: (id: string, cid: string) => `${PREFIX.USER}:${cid}:${id}`,
    join: (id: string, cid: string) => `${PREFIX.JOIN}:${cid}:${id}`,
    site: (id: string, cid: string) => `${PREFIX.SITE}:${cid}:${id}`,
    usertoken: (id: string, cid: string) => `${PREFIX.USERTOKEN}:${cid}:${id}`,
    preference: (key: string) => `${PREFIX.PREF}:${key}`,
} as const;

// 내부 헬퍼 함수: 특정 도메인의 모든 데이터 가져오기 (CID 필터링 옵션)
const getAllData = async <T>(prefixType: string, cid?: string): Promise<T[]> => {
    // cid가 있으면 "PREFIX:CID:"로 검색, 없으면 "PREFIX:"로 검색(전체)
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
    fetch: async (payload: FetchCacheDataPayload) => {
        const { id, cid } = payload;
        switch (payload.type) {
            case 'channel':
                return await storageService.get<ChannelView>(Keys.channel(id, cid));
            case 'chat':
                return await storageService.get<ChatView>(Keys.chat(id, cid));
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

    // Fetch 다수 (CID 없으면 전체 조회)
    fetchAll: async (payload: FetchAllCacheDataPayload) => {
        const { cid } = payload.query || {};

        switch (payload.type) {
            case 'channel':
                return await getAllData<ChannelView>(PREFIX.CHANNEL, cid);
            case 'chat': {
                const { channelId } = payload.query || {};
                const prefix = cid ? `${PREFIX.CHAT}:${cid}:` : `${PREFIX.CHAT}:`;

                let keys = storageService.getAllKeys().filter(k => k.startsWith(prefix));
                if (channelId) {
                    // 키 구조: chat:{cid}:{channelId}:{chatNo}
                    keys = keys.filter(k => {
                        const idPart = k.slice(prefix.length);
                        const lastColon = idPart.lastIndexOf(':');
                        const keyChannelId = lastColon !== -1 ? idPart.slice(0, lastColon) : idPart;
                        // U:1000109 === 1000109 케이스 대응
                        return (
                            keyChannelId === channelId ||
                            keyChannelId.endsWith(`:${channelId}`) ||
                            keyChannelId.endsWith(channelId)
                        );
                    });
                }

                const results = await Promise.all(keys.map(k => storageService.get<ChatView>(k)));
                const items = results.filter(item => item !== null) as ChatView[];
                return items.sort((a, b) => (a.chatNo ?? 0) - (b.chatNo ?? 0));
            }
            case 'user':
                return await getAllData<UserView>(PREFIX.USER, cid);
            case 'join':
                return await getAllData<JoinView>(PREFIX.JOIN, cid);
            case 'site':
                return await getAllData<SiteView>(PREFIX.SITE, cid);
            case 'usertoken':
                return await getAllData<UserTokenView>(PREFIX.USERTOKEN, cid);
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
