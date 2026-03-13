import { StorageService } from './mmkv';
import type {
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    FetchAllCacheDataPayload,
    FetchCacheDataPayload,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
} from '@chatic/app-messages';
import type { ChannelView, ChatView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';
import type { SiteView, UserTokenView } from '@lemoncloud/chatic-backend-api';

const PREFIX = {
    CHANNEL: 'channel:',
    CHAT: 'chat:',
    USER: 'user:',
    JOIN: 'join:',
    SITE: 'site:',
    USERTOKEN: 'usertoken:',
} as const;

/**
 * 도메인별 관리 키 정보 생성기
 */
const Keys = {
    channel: (channelId: string) => `${PREFIX.CHANNEL}${channelId}`,
    chat: (channelId: string) => `${PREFIX.CHAT}${channelId}`,
    user: (userId: string) => `${PREFIX.USER}${userId}`,
    join: (joinId: string) => `${PREFIX.JOIN}${joinId}`,
    site: (siteId: string) => `${PREFIX.SITE}${siteId}`,
    usertoken: (userId: string) => `${PREFIX.USERTOKEN}${userId}`,
} as const;

export const CacheRepository = {
    // Channel Repository
    saveChannel: async (id: string, data: ChannelView) => StorageService.set(Keys.channel(id), data),
    getChannel: async (id: string) => StorageService.get<ChannelView>(Keys.channel(id)),
    removeChannel: async (id: string) => StorageService.remove(Keys.channel(id)),
    getAllChannels: async () => {
        const keys = StorageService.getAllKeys().filter(k => k.startsWith(PREFIX.CHANNEL));
        const results = await Promise.all(keys.map(k => StorageService.get<ChannelView>(k)));
        return results.filter((item): item is ChannelView => item !== null);
    },

    // Chat Repository
    saveChat: async (id: string, data: ChatView) => StorageService.set(Keys.chat(id), data),
    getChat: async (id: string) => StorageService.get<ChatView>(Keys.chat(id)),
    removeChat: async (chatId: string) => StorageService.remove(Keys.chat(chatId)),
    getAllChats: async () => {
        const keys = StorageService.getAllKeys().filter(k => k.startsWith(PREFIX.CHAT));
        const results = await Promise.all(keys.map(k => StorageService.get<ChatView>(k)));
        return results.filter((item): item is ChatView => item !== null);
    },
    getChatsByChannel: async (channelId: string) => {
        const allChats = await CacheRepository.getAllChats();
        return allChats.filter(
            chat => (chat as any).channelId === channelId || (chat as any).channel?.id === channelId
        );
    },

    // User Repository
    saveUser: async (id: string, data: UserView) => StorageService.set(Keys.user(id), data),
    getUser: async (id: string) => StorageService.get<UserView>(Keys.user(id)),
    removeUser: async (id: string) => StorageService.remove(Keys.user(id)),
    getAllUsers: async () => {
        const keys = StorageService.getAllKeys().filter(k => k.startsWith(PREFIX.USER));
        const results = await Promise.all(keys.map(k => StorageService.get<UserView>(k)));
        return results.filter((item): item is UserView => item !== null);
    },

    // Join Repository
    saveJoin: async (id: string, data: JoinView) => StorageService.set(Keys.join(id), data),
    getJoin: async (id: string) => StorageService.get<JoinView>(Keys.join(id)),
    removeJoin: async (id: string) => StorageService.remove(Keys.join(id)),
    getAllJoins: async () => {
        const keys = StorageService.getAllKeys().filter(k => k.startsWith(PREFIX.JOIN));
        const results = await Promise.all(keys.map(k => StorageService.get<JoinView>(k)));
        return results.filter((item): item is JoinView => item !== null);
    },

    // Site Repository
    saveSite: async (id: string, data: SiteView) => StorageService.set(Keys.site(id), data),
    getSite: async (id: string) => StorageService.get<SiteView>(Keys.site(id)),
    removeSite: async (id: string) => StorageService.remove(Keys.site(id)),
    getAllSites: async () => {
        const keys = StorageService.getAllKeys().filter(k => k.startsWith(PREFIX.SITE));
        const results = await Promise.all(keys.map(k => StorageService.get<SiteView>(k)));
        return results.filter((item): item is SiteView => item !== null);
    },

    // UserToken Repository
    saveUserToken: async (id: string, data: UserTokenView) => StorageService.set(Keys.usertoken(id), data),
    getUserToken: async (id: string) => StorageService.get<UserTokenView>(Keys.usertoken(id)),
    removeUserToken: async (id: string) => StorageService.remove(Keys.usertoken(id)),
    getAllUserTokens: async () => {
        const keys = StorageService.getAllKeys().filter(k => k.startsWith(PREFIX.USERTOKEN));
        const results = await Promise.all(keys.map(k => StorageService.get<UserTokenView>(k)));
        return results.filter((item): item is UserTokenView => item !== null);
    },

    fetch: async (payload: FetchCacheDataPayload) => {
        switch (payload.type) {
            case 'channel':
                return await CacheRepository.getChannel(payload.id);
            case 'chat':
                return await CacheRepository.getChat(payload.id);
            case 'user':
                return await CacheRepository.getUser(payload.id);
            case 'join':
                return await CacheRepository.getJoin(payload.id);
            case 'site':
                return await CacheRepository.getSite(payload.id);
            case 'usertoken':
                return await CacheRepository.getUserToken(payload.id);
        }
    },

    fetchAll: async (payload: FetchAllCacheDataPayload) => {
        switch (payload.type) {
            case 'channel': {
                return await CacheRepository.getAllChannels();
            }
            case 'chat': {
                const { channelId } = payload.query || {};
                return channelId
                    ? await CacheRepository.getChatsByChannel(channelId)
                    : await CacheRepository.getAllChats();
            }
            case 'user': {
                return await CacheRepository.getAllUsers();
            }
            case 'join': {
                const joins = await CacheRepository.getAllJoins();
                const { channelId } = payload.query || {};

                let filteredJoins = joins;
                if (channelId) {
                    filteredJoins = filteredJoins.filter(j => j.channelId === channelId);
                }
                return filteredJoins;
            }
            case 'site': {
                const sites = await CacheRepository.getAllSites();
                const { ownerId } = payload.query || {};
                return ownerId ? sites.filter(s => s.ownerId === ownerId) : sites;
            }
            case 'usertoken': {
                const tokens = await CacheRepository.getAllUserTokens();
                const { role } = payload.query || {};
                return role ? tokens.filter(t => t.role === role) : tokens;
            }
        }
    },

    save: async (payload: SaveCacheDataPayload): Promise<string> => {
        switch (payload.type) {
            case 'channel':
                await CacheRepository.saveChannel(payload.id, payload.item);
                break;
            case 'chat': {
                await CacheRepository.saveChat(payload.id, payload.item);
                break;
            }
            case 'user':
                await CacheRepository.saveUser(payload.id, payload.item);
                break;
            case 'join':
                await CacheRepository.saveJoin(payload.id, payload.item);
                break;
            case 'site':
                await CacheRepository.saveSite(payload.id, payload.item);
                break;
            case 'usertoken':
                await CacheRepository.saveUserToken(payload.id, payload.item);
                break;
        }
        return payload.id;
    },

    saveAll: async (payload: SaveAllCacheDataPayload): Promise<string[]> => {
        const ids: string[] = [];
        await Promise.all(
            payload.items.map(async (item: any) => {
                const id = item.id;
                if (id) {
                    await CacheRepository.save({ type: payload.type, id, item } as any);
                    ids.push(id);
                }
            })
        );
        return ids;
    },

    delete: async (payload: DeleteCacheDataPayload): Promise<string> => {
        switch (payload.type) {
            case 'channel':
                await CacheRepository.removeChannel(payload.id);
                break;
            case 'chat':
                await CacheRepository.removeChat(payload.id);
                break;
            case 'user':
                await CacheRepository.removeUser(payload.id);
                break;
            case 'join':
                await CacheRepository.removeJoin(payload.id);
                break;
            case 'site':
                await CacheRepository.removeSite(payload.id);
                break;
            case 'usertoken':
                await CacheRepository.removeUserToken(payload.id);
                break;
        }
        return payload.id;
    },

    deleteAll: async (payload: DeleteAllCacheDataPayload): Promise<string[]> => {
        if (!payload.ids || payload.ids.length === 0) return [];

        await Promise.all(payload.ids.map(id => CacheRepository.delete({ type: payload.type, id } as any)));
        return payload.ids;
    },
};
