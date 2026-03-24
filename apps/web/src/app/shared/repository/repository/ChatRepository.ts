import { createNativeDBAdapter, isNativeApp } from '../core';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import type { StorageRepository } from '../core';

interface ChatRepository extends StorageRepository<ChatView> {}

export const chatRepository = (cid: string): ChatRepository => {
    const adapter: StorageRepository<ChatView> = isNativeApp()
        ? createNativeDBAdapter<ChatView>('chat', cid)
        : createNativeDBAdapter<ChatView>('chat', cid);

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
