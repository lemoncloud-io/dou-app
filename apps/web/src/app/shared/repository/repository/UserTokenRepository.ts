import { isNativeApp } from '../core';
import { createNativeDBAdapter } from '../core';
import type { StorageRepository } from '../core';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

interface UserTokenRepository extends StorageRepository<UserTokenView> {}

export const userTokenRepository = (cid: string): UserTokenRepository => {
    const adapter: StorageRepository<UserTokenView> = isNativeApp()
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
