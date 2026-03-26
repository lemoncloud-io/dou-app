import { createNativeDBAdapter, isNativeApp } from '../core';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { StorageRepository } from '../core';

interface ChannelRepository extends StorageRepository<ChannelView> {}

export const channelRepository = (cid: string): ChannelRepository => {
    const adapter: StorageRepository<ChannelView> = isNativeApp()
        ? createNativeDBAdapter<ChannelView>('channel', cid)
        : createNativeDBAdapter<ChannelView>('channel', cid);

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
