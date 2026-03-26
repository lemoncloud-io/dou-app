import { isNativeApp } from '../core';
import { createNativeDBAdapter } from '../core';
import type { StorageRepository } from '../core';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

interface JoinRepository extends StorageRepository<JoinView> {}

export const joinRepository = (cid: string): JoinRepository => {
    const adapter: StorageRepository<JoinView> = isNativeApp()
        ? createNativeDBAdapter<JoinView>('join', cid)
        : createNativeDBAdapter<JoinView>('join', cid);

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
