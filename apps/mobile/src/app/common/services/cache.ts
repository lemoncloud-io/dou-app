import { StorageService } from './mmkv';
import type { ChannelView, JoinView, UserView, ChatView } from '@lemoncloud/chatic-socials-api';

const PREFIX = {
    CHANNEL: 'channel:',
    CHAT: 'chat:',
    USER: 'user:',
    JOIN: 'join:',
} as const;

/**
 * - 도메인에서 관리하는 키 정보
 * - channel => <channelId>
 * - chatId => <channelId>:<chatNo>
 * - userId => <userId>
 * - joinId => <channelId>@<userId>
 */
const Keys = {
    channel: (channelId: string) => `${PREFIX.CHANNEL}${channelId}`,
    chat: (chatId: string) => `${PREFIX.CHAT}${chatId}`,
    user: (userId: string) => `${PREFIX.USER}${userId}`,
    join: (joinId: string) => `${PREFIX.JOIN}${joinId}`,
} as const;

export const CacheRepository = {
    // Channel Repository
    saveChannel: async (channelId: string, data: ChannelView) => {
        await StorageService.set(Keys.channel(channelId), data);
    },
    getChannel: async (channelId: string) => {
        return await StorageService.get<ChannelView>(Keys.channel(channelId));
    },
    removeChannel: async (channelId: string) => {
        await StorageService.remove(Keys.channel(channelId));
    },
    getAllChannels: async () => {
        const keys = StorageService.getAllKeys().filter(key => key.startsWith(PREFIX.CHANNEL));
        const results = await Promise.all(keys.map(key => StorageService.get<ChannelView>(key)));
        return results.filter((item): item is ChannelView => item !== null);
    },

    // Chat Repository
    saveChat: async (chatId: string, data: ChatView) => {
        await StorageService.set(Keys.chat(chatId), data);
    },
    getChat: async (chatId: string) => {
        return await StorageService.get<ChatView>(Keys.chat(chatId));
    },
    removeChat: async (chatId: string) => {
        await StorageService.remove(Keys.chat(chatId));
    },
    getAllChats: async () => {
        const keys = StorageService.getAllKeys().filter(key => key.startsWith(PREFIX.CHAT));
        const results = await Promise.all(keys.map(key => StorageService.get<ChatView>(key)));
        return results.filter((item): item is ChatView => item !== null);
    },

    // User Repository
    saveUser: async (userId: string, data: UserView) => {
        await StorageService.set(Keys.user(userId), data);
    },
    getUser: async (userId: string) => {
        return await StorageService.get<UserView>(Keys.user(userId));
    },
    removeUser: async (userId: string) => {
        await StorageService.remove(Keys.user(userId));
    },
    getAllUsers: async () => {
        const keys = StorageService.getAllKeys().filter(key => key.startsWith(PREFIX.USER));
        const results = await Promise.all(keys.map(key => StorageService.get<UserView>(key)));
        return results.filter((item): item is UserView => item !== null);
    },

    // Join Repository
    saveJoin: async (joinId: string, data: JoinView) => {
        await StorageService.set(Keys.join(joinId), data);
    },
    getJoin: async (joinId: string) => {
        return await StorageService.get<JoinView>(Keys.join(joinId));
    },
    removeJoin: async (joinId: string) => {
        await StorageService.remove(Keys.join(joinId));
    },
    getAllJoins: async () => {
        const keys = StorageService.getAllKeys().filter(key => key.startsWith(PREFIX.JOIN));
        const results = await Promise.all(keys.map(key => StorageService.get<JoinView>(key)));
        return results.filter((item): item is JoinView => item !== null);
    },
};
