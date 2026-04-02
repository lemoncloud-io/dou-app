import type { CacheStorage } from '../local';
import { createNativeDBAdapter, isNativeApp } from '../local';
import type { SiteView } from '@lemoncloud/chatic-socials-api';

interface SiteRepository extends CacheStorage<SiteView> {}

export const siteRepository = (cid: string): SiteRepository => {
    const adapter: CacheStorage<SiteView> = isNativeApp()
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
