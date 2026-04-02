import { isNativeApp } from '../local';
import { createNativeDBAdapter } from '../local';
import type { CacheStorage } from '../local';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

interface UserTokenRepository extends CacheStorage<UserTokenView> {}

export const userTokenRepository = (cid: string): UserTokenRepository => {
    const adapter: CacheStorage<UserTokenView> = isNativeApp()
        ? createNativeDBAdapter<UserTokenView>('usertoken', cid)
        : createNativeDBAdapter<UserTokenView>('usertoken', cid);

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
