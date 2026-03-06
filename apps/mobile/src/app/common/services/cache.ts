import { StorageService } from './mmkv';
import type { ClientMessage } from '@chatic/app-messages';
import type { ChannelView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';

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
    chat: (channelId: string, messageId: string) => `${PREFIX.CHAT}${channelId}:${messageId}`,
    chatPrefix: (channelId: string) => `${PREFIX.CHAT}${channelId}:`,
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
    saveChat: async (channelId: string, messageId: string, data: ClientMessage) => {
        await StorageService.set(Keys.chat(channelId, messageId), data);
    },
    getChat: async (channelId: string, messageId: string) => {
        const raw = await StorageService.get<Omit<ClientMessage, 'timestamp'> & { timestamp: string }>(
            Keys.chat(channelId, messageId)
        );
        if (!raw) return null;
        return { ...raw, timestamp: new Date(raw.timestamp) } as ClientMessage;
    },
    removeChat: async (channelId: string, messageId: string) => {
        await StorageService.remove(Keys.chat(channelId, messageId));
    },
    getChatsByChannel: async (channelId: string) => {
        const prefix = Keys.chatPrefix(channelId);
        const keys = StorageService.getAllKeys().filter(key => key.startsWith(prefix));
        const results = await Promise.all(
            keys.map(key => StorageService.get<Omit<ClientMessage, 'timestamp'> & { timestamp: string }>(key))
        );
        return results
            .filter((item): item is Omit<ClientMessage, 'timestamp'> & { timestamp: string } => item !== null)
            .map(item => ({ ...item, timestamp: new Date(item.timestamp) }) as ClientMessage);
    },
    clearChatsByChannel: async (channelId: string) => {
        const prefix = Keys.chatPrefix(channelId);
        const keys = StorageService.getAllKeys().filter(key => key.startsWith(prefix));
        await Promise.all(keys.map(key => StorageService.remove(key)));
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
