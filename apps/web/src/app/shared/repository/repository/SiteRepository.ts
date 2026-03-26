import type { StorageRepository } from '../core';
import { createNativeDBAdapter, isNativeApp } from '../core';
import type { SiteView } from '@lemoncloud/chatic-socials-api';

interface SiteRepository extends StorageRepository<SiteView> {}

export const siteRepository = (cid: string): SiteRepository => {
    const adapter: StorageRepository<SiteView> = isNativeApp()
        ? createNativeDBAdapter<SiteView>('site', cid)
        : createNativeDBAdapter<SiteView>('site', cid);

    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
