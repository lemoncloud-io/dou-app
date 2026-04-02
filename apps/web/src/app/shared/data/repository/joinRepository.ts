import { isNativeApp } from '../local';
import { createNativeDBAdapter } from '../local';
import type { CacheStorage } from '../local';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

interface JoinRepository extends CacheStorage<JoinView> {}

export const joinRepository = (cid: string): JoinRepository => {
    const adapter: CacheStorage<JoinView> = isNativeApp()
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
