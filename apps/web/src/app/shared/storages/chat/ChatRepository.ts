import { isNativeApp } from '../core';
import { createIndexedDBAdapter } from '../core';
import { createNativeDBAdapter } from '../core';
import type { StorageAdapter } from '../core';
import type { ChatView } from '@lemoncloud/chatic-socials-api';

interface ChatRepository extends StorageAdapter<ChatView> {
    update(userId: string, channelId: string, chatNo: number, readerUserId: string): Promise<void>;

    clear(userId: string, channelId: string): Promise<void>;

    countUnread(userId: string, channelId: string): Promise<number>;

    markAllRead(userId: string, channelId: string): Promise<void>;
}

export const chatRepository = (): ChatRepository => {
    const adapter: StorageAdapter<ChatView> = isNativeApp()
        ? createNativeDBAdapter<ChatView>('chat')
        : createIndexedDBAdapter<ChatView>('chats');

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),

        update: async () => {
            return Promise.resolve();
        },
        clear: async () => {
            return Promise.resolve();
        },
        countUnread: async () => {
            return Promise.resolve(-1);
        },
        markAllRead: async () => {
            return Promise.resolve();
        },
    };
};
