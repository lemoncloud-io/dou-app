import { createIndexedDBAdapter } from '../core';
import { createNativeDBAdapter } from '../core';
import type { StorageAdapter } from '../core';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import { isNativeApp } from '../core';

export const channelRepository = (): StorageAdapter<ChannelView> => {
    const adapter: StorageAdapter<ChannelView> = isNativeApp()
        ? createNativeDBAdapter<ChannelView>('channel')
        : createIndexedDBAdapter<ChannelView>('channels');

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
