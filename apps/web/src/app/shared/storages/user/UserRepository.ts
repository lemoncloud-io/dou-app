import { createIndexedDBAdapter, isNativeApp } from '../core';
import { createNativeDBAdapter } from '../core';
import type { StorageAdapter } from '../core';
import type { UserView } from '@lemoncloud/chatic-socials-api';

export const userRepository = (): StorageAdapter<UserView> => {
    const adapter: StorageAdapter<UserView> = isNativeApp()
        ? createNativeDBAdapter<UserView>('user')
        : createIndexedDBAdapter<UserView>('users');

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
