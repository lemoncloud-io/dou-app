import { isNativeApp } from '../local';
import { createNativeDBAdapter } from '../local';
import type { CacheStorage } from '../local';
import type { UserView } from '@lemoncloud/chatic-socials-api';

interface UserRepository extends CacheStorage<UserView> {}

export const userRepository = (cid: string): UserRepository => {
    const adapter: CacheStorage<UserView> = isNativeApp()
        ? createNativeDBAdapter<UserView>('user', cid)
        : createNativeDBAdapter<UserView>('user', cid);

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
