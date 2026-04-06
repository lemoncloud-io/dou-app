import { createNativeDBAdapter } from '../core';
import type { StorageRepository } from '../core';
import type { InviteCloudView } from '@chatic/app-messages';

interface InviteCloudRepository extends StorageRepository<InviteCloudView> {}

export const inviteCloudRepository = (): InviteCloudRepository => {
    const adapter = createNativeDBAdapter<InviteCloudView>('invitecloud', '');
    return {
        save: (id, item) => adapter.save(id, item),
        saveAll: items => adapter.saveAll(items),
        load: id => adapter.load(id),
        loadAll: query => adapter.loadAll(query),
        delete: id => adapter.delete(id),
        deleteAll: ids => adapter.deleteAll(ids),
    };
};
