import { createNativeDBAdapter, isNativeApp } from '../local';
import type { CacheStorage } from '../local';
import type { CloudView } from '@lemoncloud/chatic-backend-api';

interface CloudRepository extends CacheStorage<CloudView> {}

export const cloudRepository = (cid: string): CloudRepository => {
    const adapter: CacheStorage<CloudView> = isNativeApp()
        ? createNativeDBAdapter<CloudView>('cloud', cid)
        : createNativeDBAdapter<CloudView>('cloud', cid);

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
